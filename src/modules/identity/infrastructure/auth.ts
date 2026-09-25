import "server-only";

import { getDatabase } from "@/infrastructure/database/client";
import { createRuntimeAuth } from "./runtime-auth";

export const auth = createRuntimeAuth(getDatabase());
