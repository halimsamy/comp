-- Six-month cadence for PCI DSS 7.2.4 (account reviews) and 12.5.2.1 (scope confirmation).
ALTER TYPE "TaskFrequency" ADD VALUE IF NOT EXISTS 'semiannually' BEFORE 'yearly';
ALTER TYPE "Frequency" ADD VALUE IF NOT EXISTS 'semiannually' BEFORE 'yearly';
