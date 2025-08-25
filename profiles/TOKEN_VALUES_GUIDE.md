# 💰 Gorbagan Token Values & Transfer Guide

## 🔢 Understanding Token Amounts

### **What are Lamports?**
- **Lamports** = Smallest unit of native tokens on Solana-based chains
- Similar to **satoshis** in Bitcoin or **wei** in Ethereum
- **1 GoRB** = 1,000,000,000 lamports (1e9)

---

## 📊 **Token Conversion Table**

| **GoRB Amount** | **Lamports** | **Scientific Notation** | **Use Case** |
|-----------------|--------------|------------------------|--------------|
| 0.000001 GoRB | 1,000 | 1e3 | Micro-transaction |
| 0.00001 GoRB | 10,000 | 1e4 | Very small tip |
| 0.0001 GoRB | 100,000 | 1e5 | Small tip |
| 0.001 GoRB | 1,000,000 | 1e6 | **Your example** |
| 0.01 GoRB | 10,000,000 | 1e7 | Small payment |
| 0.1 GoRB | 100,000,000 | 1e8 | Medium payment |
| 1 GoRB | 1,000,000,000 | 1e9 | Large payment |
| 10 GoRB | 10,000,000,000 | 1e10 | Very large payment |

---

## 🎯 **Your Examples Explained**

### **Example 1: 1,000,000 lamports**
```rust
transfer_by_username("alice.dev", 1_000_000, Some("Payment for services"))
//                               ↑ 
//                         This is 0.001 GoRB
```

**Real Value:** 0.001 GoRB (very small amount)

### **Example 2: 500,000 lamports**
```rust
transfer_by_mapping("alice.dev", "donation", 500_000, Some("Tip for great work"))
//                                          ↑
//                                   This is 0.0005 GoRB
```

**Real Value:** 0.0005 GoRB (even smaller amount)

---

## 💡 **Better Examples with Realistic Amounts**

### **🏠 Daily Use Cases:**

```rust
// Coffee payment (0.01 GoRB)
transfer_by_username("cafe.gorb", 10_000_000, Some("Coffee payment"))

// Lunch payment (0.1 GoRB)  
transfer_by_username("restaurant.sol", 100_000_000, Some("Lunch bill"))

// Small donation (0.05 GoRB)
transfer_by_mapping("charity.dev", "donation", 50_000_000, Some("Monthly donation"))

// Freelance payment (5 GoRB)
transfer_by_username("developer.eth", 5_000_000_000, Some("Website development"))
```

### **💼 Business Use Cases:**

```rust
// Salary payment (100 GoRB)
transfer_by_mapping("employee.sol", "wallet", 100_000_000_000, Some("Monthly salary"))

// Supplier payment (1000 GoRB)
transfer_by_username("supplier.gorb", 1_000_000_000_000, Some("Inventory purchase"))

// Investment (10,000 GoRB)
transfer_by_mapping("startup.dev", "business", 10_000_000_000_000, Some("Series A investment"))
```

---

## 🔧 **Helper Functions for Your Tests**

### **Amount Converters:**

```typescript
// Helper functions for TypeScript tests
export const gorb = {
  // Convert GoRB to lamports
  toLamports: (gorb: number): number => Math.floor(gorb * 1_000_000_000),
  
  // Convert lamports to GoRB
  toGorb: (lamports: number): number => lamports / 1_000_000_000,
  
  // Format for display
  format: (lamports: number): string => `${gorb.toGorb(lamports)} GoRB`,
};

// Usage examples:
const coffeePayment = gorb.toLamports(0.01);     // 10_000_000 lamports
const salaryPayment = gorb.toLamports(100);      // 100_000_000_000 lamports
const microTip = gorb.toLamports(0.0001);        // 100_000 lamports

console.log(gorb.format(1_000_000));             // "0.001 GoRB"
console.log(gorb.format(100_000_000));           // "0.1 GoRB"
```

---

## 🎪 **Updated Examples with Proper Amounts**

### **Real-World Transfer Examples:**

```rust
// 1. Coffee shop payment
transfer_by_username(
    "coffee.shop",              // recipient username
    gorb.toLamports(0.015),     // 15_000_000 lamports = 0.015 GoRB
    Some("Grande latte")        // memo
)

// 2. Tip content creator
transfer_by_mapping(
    "creator.sol",              // recipient username
    "donation",                 // address type (donation@creator.sol)
    gorb.toLamports(0.05),      // 50_000_000 lamports = 0.05 GoRB
    Some("Great video!")        // memo
)

// 3. Pay freelancer
transfer_by_username(
    "designer.eth",             // recipient username
    gorb.toLamports(25),        // 25_000_000_000 lamports = 25 GoRB
    Some("Logo design work")    // memo
)

// 4. Send to business wallet
transfer_by_mapping(
    "company.gorb",             // recipient username
    "business",                 // address type (business@company.gorb)
    gorb.toLamports(500),       // 500_000_000_000 lamports = 500 GoRB
    Some("Service contract")    // memo
)
```

---

## ⚡ **Quick Reference**

### **Common Amounts:**
- **Micro-tip**: `100_000` lamports = 0.0001 GoRB
- **Small tip**: `1_000_000` lamports = 0.001 GoRB
- **Coffee**: `15_000_000` lamports = 0.015 GoRB
- **Lunch**: `50_000_000` lamports = 0.05 GoRB
- **Service**: `100_000_000` lamports = 0.1 GoRB
- **Freelance**: `5_000_000_000` lamports = 5 GoRB
- **Salary**: `100_000_000_000` lamports = 100 GoRB

### **Why Use Lamports?**
1. **Precision**: No decimal issues in smart contracts
2. **Efficiency**: Integer math is faster and safer
3. **Compatibility**: Standard across Solana ecosystem
4. **Gorbagan**: Follows Solana conventions for native tokens

---

## 🎯 **Your Original Question Answered:**

**Why these values?**
- `1,000,000` = You were sending **0.001 GoRB** (very small amount)
- `500,000` = You were sending **0.0005 GoRB** (even smaller)

**For real usage, consider:**
- `10_000_000` = 0.01 GoRB (coffee money)
- `100_000_000` = 0.1 GoRB (meal money)  
- `1_000_000_000` = 1 GoRB (decent payment)

**Remember:** Always think in GoRB for user display, but code in lamports for precision! 💰✨ 