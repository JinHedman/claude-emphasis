check:
    claude plugin validate .
    claude plugin test .
    node scripts/rules.ts | diff - rules/emphasis.md

rules:
    node scripts/rules.ts > rules/emphasis.md
