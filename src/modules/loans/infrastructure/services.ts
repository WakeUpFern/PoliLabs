import "server-only";
import { getDatabase } from "@/infrastructure/database/client";
import { LoanService } from "../application/loans";
import { DrizzleLoanStore } from "./loan-store";
export const loanService = new LoanService(new DrizzleLoanStore(getDatabase()));
