use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_instruction;

declare_id!("GrJrqEtxztquco6Zsg9WfrArYwy5BZwzJ4ce4TfcJLuJ");
// <-- replace via anchor keys sync + Anchor.toml

/// A decentralized profile + UPI-style handle mapping program.
/// - Unique username per profile (lowercase ASCII: [a-z0-9._-], 1..=32, *no '@'*)
/// - Main wallet address pointer (wallet@username)
/// - Arbitrary per-type mappings, e.g. nft@username, token@username, metadata@username, custom-foo@username
/// - Reverse lookup: main_address -> username (for quick "who is this address?" UX)
/// - Username-based token transfers (Gorbagan chain native tokens)
/// - Authentication system with points (100 starting points, 1 point = 0.00005 Gorb)
///
/// PDA layout:
///  Profile        : ["profile", username]
///  Mapping        : ["mapping", username, address_type]
///  ReverseLookup  : ["reverse", main_address]
///  UserPoints     : ["points", username]
///  AuthSession    : ["auth", username, session_id]

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

        // Initialize user points with 100 starting points
        let user_points = &mut ctx.accounts.user_points;
        user_points.username = profile.username.clone();
        user_points.points_balance = INITIAL_POINTS;
        user_points.points_value_gorb = (INITIAL_POINTS as u64) * POINT_VALUE_GORB;
        user_points.bump = ctx.bumps.user_points;

        emit!(ProfileCreated {
            profile: profile.key(),
            authority: profile.authority,
            main_address: profile.main_address,
            username: profile.username.clone(),
        });

        emit!(UserPointsInitialized {
            username: profile.username.clone(),
            initial_points: INITIAL_POINTS,
            points_value_gorb: user_points.points_value_gorb,
        });

        Ok(())
    }

    // ---------------------------------------------------------------------
    // AUTHENTICATION & POINTS SYSTEM
    // ---------------------------------------------------------------------

    /// Create an authentication session for a user
    /// This generates a unique session ID and validates the user has sufficient points
    pub fn create_auth_session(
        ctx: Context<CreateAuthSession>,
        session_id: String,
        required_points: u32,
    ) -> Result<()> {
        let user_points = &mut ctx.accounts.user_points;
        
        // Check if user has sufficient points
        if user_points.points_balance < required_points {
            return err!(ErrorCode::InsufficientPoints);
        }

        let auth_session = &mut ctx.accounts.auth_session;
        auth_session.username = user_points.username.clone();
        auth_session.session_id = session_id;
        auth_session.required_points = required_points;
        auth_session.created_at = Clock::get()?.unix_timestamp;
        auth_session.is_active = true;
        auth_session.bump = ctx.bumps.auth_session;

        emit!(AuthSessionCreated {
            username: auth_session.username.clone(),
            session_id: auth_session.session_id.clone(),
            required_points,
            created_at: auth_session.created_at,
        });

        Ok(())
    }

    /// Validate an authentication session and deduct points for a transaction
    /// This is called before any transaction that requires authentication
    pub fn validate_and_deduct_points(
        ctx: Context<ValidateAndDeductPoints>,
        session_id: String,
        points_to_deduct: u32,
    ) -> Result<()> {
        let user_points = &mut ctx.accounts.user_points;
        let auth_session = &mut ctx.accounts.auth_session;

        // Validate session belongs to the user
        if auth_session.username != user_points.username {
            return err!(ErrorCode::SessionUsernameMismatch);
        }

        // Validate session ID matches
        if auth_session.session_id != session_id {
            return err!(ErrorCode::InvalidSessionId);
        }

        // Check if session is still active
        if !auth_session.is_active {
            return err!(ErrorCode::SessionExpired);
        }

        // Check if user has sufficient points
        if user_points.points_balance < points_to_deduct {
            return err!(ErrorCode::InsufficientPoints);
        }

        // Deduct points
        user_points.points_balance = user_points.points_balance.saturating_sub(points_to_deduct);
        user_points.points_value_gorb = (user_points.points_balance as u64) * POINT_VALUE_GORB;

        // Deactivate session after use
        auth_session.is_active = false;

        emit!(PointsDeducted {
            username: user_points.username.clone(),
            session_id: session_id.clone(),
            points_deducted: points_to_deduct,
            remaining_points: user_points.points_balance,
            remaining_value_gorb: user_points.points_value_gorb,
        });

        Ok(())
    }

    /// Add points to a user's balance (for rewards, purchases, etc.)
    pub fn add_points(
        ctx: Context<AddPoints>,
        points_to_add: u32,
    ) -> Result<()> {
        let user_points = &mut ctx.accounts.user_points;
        
        user_points.points_balance = user_points.points_balance.saturating_add(points_to_add);
        user_points.points_value_gorb = (user_points.points_balance as u64) * POINT_VALUE_GORB;

        emit!(PointsAdded {
            username: user_points.username.clone(),
            points_added: points_to_add,
            new_balance: user_points.points_balance,
            new_value_gorb: user_points.points_value_gorb,
        });

        Ok(())
    }

    /// Get current points balance for a user
    pub fn get_points_balance(
        ctx: Context<GetPointsBalance>,
        username: String,
    ) -> Result<()> {
        let user_points = &ctx.accounts.user_points;
        
        // Verify username matches
        if user_points.username != username {
            return err!(ErrorCode::UsernameMismatch);
        }

        emit!(PointsBalanceRequested {
            username: username.clone(),
            points_balance: user_points.points_balance,
            points_value_gorb: user_points.points_value_gorb,
            requester: ctx.accounts.requester.key(),
            timestamp: Clock::get()?.unix_timestamp,
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

    // ---------------------------------------------------------------------
    // USERNAME-BASED TOKEN TRANSFERS (Gorbagan Chain) - WITH AUTHENTICATION
    // ---------------------------------------------------------------------

    /// Transfer Gorbagan native tokens using username instead of direct address.
    /// Resolves `to_username` to their main wallet and performs the transfer.
    /// Works with Gorbagan's non-standard token implementation.
    /// REQUIRES: Valid authentication session and sufficient points
    pub fn transfer_by_username(
        ctx: Context<TransferByUsername>, 
        to_username: String,
        amount: u64,
        memo: Option<String>,
        session_id: String,
    ) -> Result<()> {
        // Validate recipient username
        validate_username(&to_username)?;
        
        // Get sender profile info
        let sender_profile = &ctx.accounts.sender_profile;
        
        // Get recipient profile info
        let recipient_profile = &ctx.accounts.recipient_profile;
        
        // Verify recipient username matches
        if recipient_profile.username != to_username {
            return err!(ErrorCode::UsernameMismatch);
        }
        
        // Get the recipient's main address (where tokens should go)
        let recipient_address = recipient_profile.main_address;
        
        // Perform native token transfer using system program
        // Note: For Gorbagan chain, this handles native tokens, not SPL tokens
        let transfer_instruction = system_instruction::transfer(
            &ctx.accounts.sender.key(),
            &recipient_address,
            amount,
        );
        
        anchor_lang::solana_program::program::invoke(
            &transfer_instruction,
            &[
                ctx.accounts.sender.to_account_info(),
                ctx.accounts.recipient_main_address.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        
        emit!(TokenTransferByUsername {
            sender: ctx.accounts.sender.key(),
            sender_username: sender_profile.username.clone(),
            recipient: recipient_address,
            recipient_username: to_username.clone(),
            amount,
            memo: clip_opt(memo, MAX_MEMO),
            timestamp: Clock::get()?.unix_timestamp,
            session_id,
        });
        
        Ok(())
    }

    /// Transfer tokens using address mapping (e.g., wallet@username, donation@username).
    /// Allows sending to specific mapped addresses instead of just main address.
    /// REQUIRES: Valid authentication session and sufficient points
    pub fn transfer_by_mapping(
        ctx: Context<TransferByMapping>,
        to_username: String,
        address_type: String,
        amount: u64,
        memo: Option<String>,
        session_id: String,
    ) -> Result<()> {
        // Validate inputs
        validate_username(&to_username)?;
        validate_addr_type(&address_type)?;
        
        // Get sender profile info
        let sender_profile = &ctx.accounts.sender_profile;
        
        // Get recipient profile info
        let recipient_profile = &ctx.accounts.recipient_profile;
        
        // Verify recipient username matches
        if recipient_profile.username != to_username {
            return err!(ErrorCode::UsernameMismatch);
        }
        
        // Get the mapped address from the mapping account
        let mapping = &ctx.accounts.recipient_mapping;
        let recipient_address = mapping.target;
        
        // Verify mapping belongs to the correct profile and type
        if mapping.profile != recipient_profile.key() || mapping.address_type != address_type {
            return err!(ErrorCode::MappingMismatch);
        }
        
        // Perform native token transfer
        let transfer_instruction = system_instruction::transfer(
            &ctx.accounts.sender.key(),
            &recipient_address,
            amount,
        );
        
        anchor_lang::solana_program::program::invoke(
            &transfer_instruction,
            &[
                ctx.accounts.sender.to_account_info(),
                ctx.accounts.recipient_mapped_address.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        
        emit!(TokenTransferByMapping {
            sender: ctx.accounts.sender.key(),
            sender_username: sender_profile.username.clone(),
            recipient: recipient_address,
            recipient_username: to_username.clone(),
            address_type: address_type.clone(),
            amount,
            memo: clip_opt(memo, MAX_MEMO),
            timestamp: Clock::get()?.unix_timestamp,
            session_id,
        });
        
        Ok(())
    }

    /// Get transfer history for a specific username (query helper).
    /// Emits recent transfer events for UI/analytics purposes.
    pub fn get_transfer_history(
        ctx: Context<GetTransferHistory>,
        username: String,
        limit: u8,
    ) -> Result<()> {
        validate_username(&username)?;
        
        let profile = &ctx.accounts.profile;
        
        // Verify username matches
        if profile.username != username {
            return err!(ErrorCode::UsernameMismatch);
        }
        
        // Emit event for off-chain indexing
        emit!(TransferHistoryRequested {
            profile: profile.key(),
            username: username.clone(),
            requester: ctx.accounts.requester.key(),
            limit: limit.min(MAX_TRANSFER_HISTORY_LIMIT),
            timestamp: Clock::get()?.unix_timestamp,
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

    /// User points account for authentication and points tracking
    #[account(
        init,
        payer = authority,
        space = USER_POINTS_SPACE,
        seeds = [b"points", username.as_bytes()],
        bump
    )]
    pub user_points: Account<'info, UserPoints>,

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

// NEW: Authentication and Points Account Structures

#[derive(Accounts)]
#[instruction(session_id: String)]
pub struct CreateAuthSession<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// User's profile (to verify authority)
    #[account(
        has_one = authority,
        seeds = [b"profile", user_points.username.as_bytes()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,
    
    /// User's points account (to check balance and deduct points)
    #[account(
        mut,
        seeds = [b"points", user_points.username.as_bytes()],
        bump = user_points.bump
    )]
    pub user_points: Account<'info, UserPoints>,
    
    /// Authentication session account
    #[account(
        init,
        payer = authority,
        space = AUTH_SESSION_SPACE,
        seeds = [b"auth", user_points.username.as_bytes(), session_id.as_bytes()],
        bump
    )]
    pub auth_session: Account<'info, AuthSession>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(session_id: String)]
pub struct ValidateAndDeductPoints<'info> {
    pub authority: Signer<'info>,
    
    /// User's profile (to verify authority)
    #[account(
        has_one = authority,
        seeds = [b"profile", profile.username.as_bytes()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,
    
    /// User's points account (to deduct points)
    #[account(
        mut,
        seeds = [b"points", profile.username.as_bytes()],
        bump = user_points.bump
    )]
    pub user_points: Account<'info, UserPoints>,
    
    /// Authentication session to validate
    #[account(
        mut,
        seeds = [b"auth", profile.username.as_bytes(), session_id.as_bytes()],
        bump = auth_session.bump
    )]
    pub auth_session: Account<'info, AuthSession>,
}

#[derive(Accounts)]
pub struct AddPoints<'info> {
    pub authority: Signer<'info>,
    
    /// User's profile (to verify authority)
    #[account(
        has_one = authority,
        seeds = [b"profile", profile.username.as_bytes()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,
    
    /// User's points account (to add points)
    #[account(
        mut,
        seeds = [b"points", profile.username.as_bytes()],
        bump = user_points.bump
    )]
    pub user_points: Account<'info, UserPoints>,
}

#[derive(Accounts)]
#[instruction(username: String)]
pub struct GetPointsBalance<'info> {
    /// Anyone can query points balance
    pub requester: Signer<'info>,
    
    /// User's profile to get points for
    #[account(
        seeds = [b"profile", username.as_bytes()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,
    
    /// User's points account
    #[account(
        seeds = [b"points", username.as_bytes()],
        bump = user_points.bump
    )]
    pub user_points: Account<'info, UserPoints>,
}

// NEW: Token Transfer Account Structures (Updated with Authentication)

#[derive(Accounts)]
#[instruction(to_username: String, session_id: String)]
pub struct TransferByUsername<'info> {
    /// Sender (must sign the transaction)
    #[account(mut)]
    pub sender: Signer<'info>,
    
    /// Sender's profile (for username resolution and event logging)
    #[account(
        constraint = sender.key() == sender_profile.authority @ ErrorCode::SenderNotAuthorized,
        seeds = [b"profile", sender_profile.username.as_bytes()],
        bump = sender_profile.bump
    )]
    pub sender_profile: Account<'info, Profile>,
    
    /// Recipient's profile (to resolve username to main address)
    #[account(
        seeds = [b"profile", to_username.as_bytes()],
        bump = recipient_profile.bump
    )]
    pub recipient_profile: Account<'info, Profile>,
    
    /// Recipient's main address account (must be writable for transfer)
    /// CHECK: This is the recipient's main address from their profile
    #[account(
        mut,
        constraint = recipient_main_address.key() == recipient_profile.main_address @ ErrorCode::RecipientAddressMismatch
    )]
    pub recipient_main_address: AccountInfo<'info>,
    
    /// Sender's points account (for authentication)
    #[account(
        mut,
        seeds = [b"points", sender_profile.username.as_bytes()],
        bump = sender_points.bump
    )]
    pub sender_points: Account<'info, UserPoints>,
    
    /// Authentication session for the sender
    #[account(
        mut,
        seeds = [b"auth", sender_profile.username.as_bytes(), session_id.as_bytes()],
        bump = auth_session.bump
    )]
    pub auth_session: Account<'info, AuthSession>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(to_username: String, address_type: String, session_id: String)]
pub struct TransferByMapping<'info> {
    /// Sender (must sign the transaction)
    #[account(mut)]
    pub sender: Signer<'info>,
    
    /// Sender's profile (for username resolution and event logging)
    #[account(
        constraint = sender.key() == sender_profile.authority @ ErrorCode::SenderNotAuthorized,
        seeds = [b"profile", sender_profile.username.as_bytes()],
        bump = sender_profile.bump
    )]
    pub sender_profile: Account<'info, Profile>,
    
    /// Recipient's profile
    #[account(
        seeds = [b"profile", to_username.as_bytes()],
        bump = recipient_profile.bump
    )]
    pub recipient_profile: Account<'info, Profile>,
    
    /// Recipient's address mapping (e.g., wallet@username, donation@username)
    #[account(
        seeds = [b"mapping", to_username.as_bytes(), address_type.as_bytes()],
        bump = recipient_mapping.bump
    )]
    pub recipient_mapping: Account<'info, AddressMapping>,
    
    /// Recipient's mapped address account (must be writable for transfer)
    /// CHECK: This is the mapped address from the address mapping
    #[account(
        mut,
        constraint = recipient_mapped_address.key() == recipient_mapping.target @ ErrorCode::RecipientAddressMismatch
    )]
    pub recipient_mapped_address: AccountInfo<'info>,
    
    /// Sender's points account (for authentication)
    #[account(
        mut,
        seeds = [b"points", sender_profile.username.as_bytes()],
        bump = sender_points.bump
    )]
    pub sender_points: Account<'info, UserPoints>,
    
    /// Authentication session for the sender
    #[account(
        mut,
        seeds = [b"auth", sender_profile.username.as_bytes(), session_id.as_bytes()],
        bump = auth_session.bump
    )]
    pub auth_session: Account<'info, AuthSession>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(username: String)]
pub struct GetTransferHistory<'info> {
    /// Anyone can query transfer history
    pub requester: Signer<'info>,
    
    /// Profile to get history for
    #[account(
        seeds = [b"profile", username.as_bytes()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,
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

// NEW: Authentication and Points Data Structures

#[account]
pub struct UserPoints {
    pub username: String,           // <=32, matches profile username
    pub points_balance: u32,        // Current points balance
    pub points_value_gorb: u64,     // Points value in Gorb (points_balance * POINT_VALUE_GORB)
    pub bump: u8,
    pub _reserved: [u8; 64],       // Reserved for future use
}

#[account]
pub struct AuthSession {
    pub username: String,           // <=32, matches profile username
    pub session_id: String,         // <=64, unique session identifier
    pub required_points: u32,       // Points required for this session
    pub created_at: i64,            // Unix timestamp when session was created
    pub is_active: bool,            // Whether session is still active
    pub bump: u8,
    pub _reserved: [u8; 32],       // Reserved for future use
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

// NEW: Authentication and Points Events

#[event]
pub struct UserPointsInitialized {
    pub username: String,
    pub initial_points: u32,
    pub points_value_gorb: u64,
}

#[event]
pub struct AuthSessionCreated {
    pub username: String,
    pub session_id: String,
    pub required_points: u32,
    pub created_at: i64,
}

#[event]
pub struct PointsDeducted {
    pub username: String,
    pub session_id: String,
    pub points_deducted: u32,
    pub remaining_points: u32,
    pub remaining_value_gorb: u64,
}

#[event]
pub struct PointsAdded {
    pub username: String,
    pub points_added: u32,
    pub new_balance: u32,
    pub new_value_gorb: u64,
}

#[event]
pub struct PointsBalanceRequested {
    pub username: String,
    pub points_balance: u32,
    pub points_value_gorb: u64,
    pub requester: Pubkey,
    pub timestamp: i64,
}

// UPDATED: Token Transfer Events (with session_id)

#[event]
pub struct TokenTransferByUsername {
    pub sender: Pubkey,
    pub sender_username: String,
    pub recipient: Pubkey,
    pub recipient_username: String,
    pub amount: u64,
    pub memo: String,
    pub timestamp: i64,
    pub session_id: String,
}

#[event]
pub struct TokenTransferByMapping {
    pub sender: Pubkey,
    pub sender_username: String,
    pub recipient: Pubkey,
    pub recipient_username: String,
    pub address_type: String,
    pub amount: u64,
    pub memo: String,
    pub timestamp: i64,
    pub session_id: String,
}

#[event]
pub struct TransferHistoryRequested {
    pub profile: Pubkey,
    pub username: String,
    pub requester: Pubkey,
    pub limit: u8,
    pub timestamp: i64,
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
pub const MAX_MEMO: usize = 100;
pub const MAX_TRANSFER_HISTORY_LIMIT: u8 = 50;
pub const MAX_SESSION_ID: usize = 64;

// Points System Constants
pub const INITIAL_POINTS: u32 = 100;                    // Starting points for new users
pub const POINT_VALUE_GORB: u64 = 50_000;              // 1 point = 0.00005 Gorb (50,000 lamports)
pub const DEFAULT_TRANSACTION_COST: u32 = 1;            // Points deducted per transaction





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

// NEW: Points and Authentication Space Constants

/// discriminator(8) + username(4+32) + points_balance(4) + points_value_gorb(8) + bump(1) + reserved(64)
pub const USER_POINTS_SPACE: usize = 8 + (4 + MAX_USERNAME) + 4 + 8 + 1 + 64;

/// discriminator(8) + username(4+32) + session_id(4+64) + required_points(4) + created_at(8) + is_active(1) + bump(1) + reserved(32)
pub const AUTH_SESSION_SPACE: usize = 8 + (4 + MAX_USERNAME) + (4 + MAX_SESSION_ID) + 4 + 8 + 1 + 1 + 32;

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid username: only [a-z0-9._-], 1..=32, and must not contain '@'")]
    InvalidUsername,
    #[msg("Invalid address type: only [a-z0-9.-], 1..=16")]
    InvalidAddressType,
    #[msg("Username does not match the provided profile")]
    UsernameMismatch,
    #[msg("Address mapping does not match the expected profile or type")]
    MappingMismatch,
    #[msg("Sender is not authorized for this profile")]
    SenderNotAuthorized,
    #[msg("Recipient address does not match profile or mapping")]
    RecipientAddressMismatch,
    #[msg("Transfer amount must be greater than zero")]
    InvalidTransferAmount,
    // NEW: Authentication and Points Error Codes
    #[msg("Insufficient points for this operation")]
    InsufficientPoints,
    #[msg("Session username does not match user points username")]
    SessionUsernameMismatch,
    #[msg("Invalid session ID")]
    InvalidSessionId,
    #[msg("Authentication session has expired or is inactive")]
    SessionExpired,
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
