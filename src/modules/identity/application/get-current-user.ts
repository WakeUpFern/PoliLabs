import { InactiveUserError } from "../domain/access-errors";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
};

export interface ActiveUserReader {
  findActiveById(userId: string): Promise<CurrentUser | null>;
}

export class GetCurrentUser {
  constructor(private readonly users: ActiveUserReader) {}

  async execute(actorUserId: string): Promise<CurrentUser> {
    const user = await this.users.findActiveById(actorUserId);
    if (!user) throw new InactiveUserError();
    return user;
  }
}
