import { InactiveUserError } from "../domain/access-errors";

export type AccessibleLaboratory = {
  id: string;
  slug: string;
  name: string;
  roleKeys: readonly string[];
  roleNames: readonly string[];
};

export interface UserLaboratoriesReader {
  listActiveForUser(
    actorUserId: string,
  ): Promise<readonly AccessibleLaboratory[] | null>;
}

export class GetUserLaboratories {
  constructor(private readonly laboratories: UserLaboratoriesReader) {}

  async execute(actorUserId: string): Promise<readonly AccessibleLaboratory[]> {
    const laboratories = await this.laboratories.listActiveForUser(actorUserId);
    if (!laboratories) throw new InactiveUserError();
    return laboratories;
  }
}
