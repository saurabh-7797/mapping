use anchor_lang::prelude::*;

declare_id!("GrJrqEtxztquco6Zsg9WfrArYwy5BZwzJ4ce4TfcJLuJ");
// <-- replace via anchor keys sync + Anchor.toml

/// A decentralized profile + UPI-style handle mapping program.
/// - Unique username per profile (lowercase ASCII: [a-z0-9._-], 1..=32, *no '@'*)
/// - Main wallet address pointer (wallet@username)
/// - Arbitrary per-type mappings, e.g. nft@username, token@username, metadata@username, custom-foo@username
/// - Reverse lookup: main_address -> username (for quick "who is this address?" UX)
///
/// PDA layout:
///  Profile        : ["profile", username]
///  Mapping        : ["mapping", username, address_type]
///  ReverseLookup  : ["reverse", main_address]

#[program]
pub mod profiles {
    use super::*;

    // ---------------------------------------------------------------------
    // CREATE
    // ---------------------------------------------------------------------

    /// Create a new profile PDA for `username`. The `username` **must be already normalized**:
    /// - lowercase ASCII only ([a-z0-9._-]), length 1..=32
    /// - must NOT contain '@'
    /// The account address is derived as PDA(["profile", username]).
    pub fn create_profile(
        ctx: Context<CreateProfile>,
        username: String,
        bio: Option<String>,
        avatar: Option<String>,
        twitter: Option<String>,
        discord: Option<String>,
        website: Option<String>,
    ) -> Result<()> {
        // Validate username (must be normalized already)
        validate_username(&username)?;

        let profile = &mut ctx.accounts.profile;
        profile.authority = ctx.accounts.authority.key();
        profile.main_address = ctx.accounts.authority.key();
        profile.bump = ctx.bumps.profile;

        profile.username = username;
        profile.bio = clip_opt(bio, MAX_BIO);
        profile.avatar = clip_opt(avatar, MAX_AVATAR);
        profile.twitter = clip_opt(twitter, MAX_HANDLE);
        profile.discord = clip_opt(discord, MAX_HANDLE);
        profile.website = clip_opt(website, MAX_SITE);

        // init reverse lookup for initial main address
        let reverse = &mut ctx.accounts.reverse;
        reverse.username = profile.username.clone();
        reverse.bump = ctx.bumps.reverse;

        emit!(ProfileCreated {
            profile: profile.key(),
            authority: profile.authority,
            main_address: profile.main_address,
            username: profile.username.clone(),
        });

        Ok(())
    }

    // ---------------------------------------------------------------------
    // PROFILE EDITS
    // ---------------------------------------------------------------------

    /// Update bio/avatar and social links.
    pub fn set_profile_details(
        ctx: Context<EditProfile>,
        bio: Option<String>,
        avatar: Option<String>,
        twitter: Option<String>,
        discord: Option<String>,
        website: Option<String>,
    ) -> Result<()> {
        let p = &mut ctx.accounts.profile;

        p.bio = clip_opt(bio, MAX_BIO);
        p.avatar = clip_opt(avatar, MAX_AVATAR);
        p.twitter = clip_opt(twitter, MAX_HANDLE);
        p.discord = clip_opt(discord, MAX_HANDLE);
        p.website = clip_opt(website, MAX_SITE);

        emit!(ProfileUpdated {
            profile: p.key(),
            authority: p.authority,
        });
        Ok(())
    }

    /// Change main address pointer. Also (upsert) a reverse lookup record at ["reverse", new_main].
    pub fn set_main_address(ctx: Context<SetMainAddress>, new_main: Pubkey) -> Result<()> {
        let p = &mut ctx.accounts.profile;
        p.main_address = new_main;

        let r = &mut ctx.accounts.reverse;
        r.username = p.username.clone();
        r.bump = ctx.bumps.reverse;

        emit!(MainAddressChanged {
            profile: p.key(),
            new_main,
        });
        Ok(())
    }

    /// Transfer profile authority (ownership).
    pub fn set_authority(ctx: Context<TransferAuthority>, new_authority: Pubkey) -> Result<()> {
        let p = &mut ctx.accounts.profile;
        p.authority = new_authority;

        emit!(AuthorityChanged {
            profile: p.key(),
            new_authority,
        });
        Ok(())
    }

    // ---------------------------------------------------------------------
    // ADDRESS MAPPINGS (UPI-style `sub@username`)
    // ---------------------------------------------------------------------

    /// Set or upsert a mapping PDA at ["mapping", username, address_type] -> target Pubkey.
    /// `address_type` must be normalized ASCII [a-z0-9.-], 1..=16 (e.g., "wallet","nft","token","metadata","custom-foo").
    /// `type_hint` is a client-defined enum tag (0=wallet,1=token,2=nft,3=metadata,4=custom).
    pub fn set_address_mapping(
        ctx: Context<SetMapping>,
        address_type: String,
        target: Pubkey,
        type_hint: u8,
    ) -> Result<()> {
        validate_addr_type(&address_type)?;
        let m = &mut ctx.accounts.mapping;

        m.profile = ctx.accounts.profile.key();
        m.bump = ctx.bumps.mapping;
        m.address_type = address_type;
        m.target = target;
        m.extra_tag = type_hint;

        emit!(MappingSet {
            profile: m.profile,
            address_type: m.address_type.clone(),
            target,
            tag: type_hint,
        });
        Ok(())
    }

    /// OPTIONAL: Emit an on-chain event with the mapping (handy for log/subscription-based UIs).
    pub fn get_address_mapping(ctx: Context<GetMapping>) -> Result<()> {
        let m = &ctx.accounts.mapping;
        emit!(MappingFetched {
            profile: m.profile,
            address_type: m.address_type.clone(),
            target: m.target,
            tag: m.extra_tag,
        });
        Ok(())
    }

    /// Remove a mapping PDA and refund rent to authority.
    pub fn clear_address_mapping(ctx: Context<ClearMapping>) -> Result<()> {
        emit!(MappingCleared {
            profile: ctx.accounts.profile.key(),
            address_type: ctx.accounts.mapping.address_type.clone(),
        });
        Ok(())
    }
}

// ==========================================================================
// Accounts
// ==========================================================================

#[derive(Accounts)]
#[instruction(username: String)]
pub struct CreateProfile<'info> {
    /// Payer & initial authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Profile PDA at ["profile", username]
    #[account(
        init,
        payer = authority,
        space = PROFILE_SPACE,
        seeds = [b"profile", username.as_bytes()],
        bump
    )]
    pub profile: Account<'info, Profile>,

    /// Reverse lookup for initial main address (authority pubkey)
    #[account(
        init,
        payer = authority,
        space = REVERSE_SPACE,
        seeds = [b"reverse", authority.key().as_ref()],
        bump
    )]
    pub reverse: Account<'info, ReverseLookup>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EditProfile<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        has_one = authority,
        seeds = [b"profile", profile.username.as_bytes()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,
}

#[derive(Accounts)]
#[instruction(new_main: Pubkey)]
pub struct SetMainAddress<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        has_one = authority,
        seeds = [b"profile", profile.username.as_bytes()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,

    /// New reverse record for the updated main address
    #[account(
        init_if_needed,
        payer = authority,
        space = REVERSE_SPACE,
        seeds = [b"reverse", new_main.key().as_ref()],
        bump
    )]
    pub reverse: Account<'info, ReverseLookup>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        has_one = authority,
        seeds = [b"profile", profile.username.as_bytes()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,
}

#[derive(Accounts)]
#[instruction(address_type: String)]
pub struct SetMapping<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        has_one = authority,
        seeds = [b"profile", profile.username.as_bytes()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,

    /// PDA: ["mapping", username, address_type]
    #[account(
        init_if_needed,
        payer = authority,
        space = MAPPING_SPACE,
        seeds = [b"mapping", profile.username.as_bytes(), address_type.as_bytes()],
        bump
    )]
    pub mapping: Account<'info, AddressMapping>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct GetMapping<'info> {
    /// Anyone can fetch/emit mapping
    #[account(
        seeds = [b"profile", profile.username.as_bytes()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,

    #[account(
        seeds = [b"mapping", profile.username.as_bytes(), mapping.address_type.as_bytes()],
        bump = mapping.bump
    )]
    pub mapping: Account<'info, AddressMapping>,
}

#[derive(Accounts)]
pub struct ClearMapping<'info> {
    pub authority: Signer<'info>,
    #[account(
        has_one = authority,
        seeds = [b"profile", profile.username.as_bytes()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,

    #[account(
        mut,
        close = authority,
        seeds = [b"mapping", profile.username.as_bytes(), mapping.address_type.as_bytes()],
        bump = mapping.bump
    )]
    pub mapping: Account<'info, AddressMapping>,
}

// ==========================================================================
// Data
// ==========================================================================

#[account]
pub struct Profile {
    pub authority: Pubkey,
    pub main_address: Pubkey,
    pub bump: u8,

    pub username: String, // normalized (lowercase), 1..=32, [a-z0-9._-]
    pub bio: String,      // <=256
    pub avatar: String,   // <=128 (URL / CID)
    pub twitter: String,  // <=32
    pub discord: String,  // <=32
    pub website: String,  // <=64

    pub _reserved: [u8; 128],
}

#[account]
pub struct AddressMapping {
    pub profile: Pubkey,     // owner profile PDA
    pub bump: u8,
    pub address_type: String, // normalized, <=16, [a-z0-9.-]
    pub target: Pubkey,      // wallet / mint / metadata / etc
    pub extra_tag: u8,       // client hint (0=wallet,1=token,2=nft,3=metadata,4=custom)
    pub _reserved: [u8; 64],
}

#[account]
pub struct ReverseLookup {
    pub username: String, // <=32
    pub bump: u8,
}

// ==========================================================================
// Events
// ==========================================================================

#[event]
pub struct ProfileCreated {
    pub profile: Pubkey,
    pub authority: Pubkey,
    pub main_address: Pubkey,
    pub username: String,
}

#[event]
pub struct ProfileUpdated {
    pub profile: Pubkey,
    pub authority: Pubkey,
}

#[event]
pub struct MainAddressChanged {
    pub profile: Pubkey,
    pub new_main: Pubkey,
}

#[event]
pub struct AuthorityChanged {
    pub profile: Pubkey,
    pub new_authority: Pubkey,
}

#[event]
pub struct MappingSet {
    pub profile: Pubkey,
    pub address_type: String,
    pub target: Pubkey,
    pub tag: u8,
}

#[event]
pub struct MappingFetched {
    pub profile: Pubkey,
    pub address_type: String,
    pub target: Pubkey,
    pub tag: u8,
}

#[event]
pub struct MappingCleared {
    pub profile: Pubkey,
    pub address_type: String,
}

// ==========================================================================
// Validation, sizing, helpers
// ==========================================================================

pub const MAX_USERNAME: usize = 32;
pub const MAX_BIO: usize = 256;
pub const MAX_AVATAR: usize = 128;
pub const MAX_HANDLE: usize = 32;
pub const MAX_SITE: usize = 64;
pub const MAX_ADDR_TYPE: usize = 16;

/// discriminator(8)
/// + authority(32) + main(32) + bump(1)
/// + username(4+32) + bio(4+256) + avatar(4+128)
/// + twitter(4+32) + discord(4+32) + website(4+64)
/// + reserved(128)
pub const PROFILE_SPACE: usize =
    8 + 32 + 32 + 1
    + 4 + MAX_USERNAME
    + 4 + MAX_BIO
    + 4 + MAX_AVATAR
    + 4 + MAX_HANDLE
    + 4 + MAX_HANDLE
    + 4 + MAX_SITE
    + 128;

/// discriminator(8)
/// + profile(32) + bump(1)
/// + address_type(4+16) + target(32) + extra_tag(1)
/// + reserved(64)
pub const MAPPING_SPACE: usize =
    8 + 32 + 1
    + (4 + MAX_ADDR_TYPE)
    + 32 + 1
    + 64;

/// discriminator(8) + username(4+32) + bump(1)
pub const REVERSE_SPACE: usize = 8 + (4 + MAX_USERNAME) + 1;

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid username: only [a-z0-9._-], 1..=32, and must not contain '@'")]
    InvalidUsername,
    #[msg("Invalid address type: only [a-z0-9.-], 1..=16")]
    InvalidAddressType,
}

fn validate_username(u: &str) -> Result<()> {
    if u.is_empty() || u.len() > MAX_USERNAME || u.contains('@') {
        return err!(ErrorCode::InvalidUsername);
    }
    // Enforce lowercase ASCII and allowed chars
    for ch in u.chars() {
        match ch {
            'a'..='z' | '0'..='9' | '.' | '_' | '-' => {}
            _ => return err!(ErrorCode::InvalidUsername),
        }
    }
    // Ensure it's already lowercase (no implicit folding)
    if u != &u.to_ascii_lowercase() {
        return err!(ErrorCode::InvalidUsername);
    }
    Ok(())
}

fn validate_addr_type(t: &str) -> Result<()> {
    if t.is_empty() || t.len() > MAX_ADDR_TYPE {
        return err!(ErrorCode::InvalidAddressType);
    }
    for ch in t.chars() {
        match ch {
            'a'..='z' | '0'..='9' | '.' | '-' => {}
            _ => return err!(ErrorCode::InvalidAddressType),
        }
    }
    if t != &t.to_ascii_lowercase() {
        return err!(ErrorCode::InvalidAddressType);
    }
    Ok(())
}

fn clip_opt(v: Option<String>, max: usize) -> String {
    let mut s = v.unwrap_or_default();
    if s.len() > max {
        s.truncate(max);
    }
    s
}