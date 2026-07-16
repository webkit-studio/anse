import { handle } from "../../server/handler";

export default async (req: Request) => handle(req);

export const config = { path: "/api/*" };
