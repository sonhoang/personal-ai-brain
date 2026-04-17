import { Router } from "express";
import { notesRouter } from "../modules/notes/notes.routes";
import { documentsRouter } from "../modules/documents/documents.routes";
import { chatRouter } from "../modules/chat/chat.routes";
import { chatStreamRouter } from "../modules/chat/chat_stream.routes";
import { managementRouter } from "../modules/management/management.routes";
import { searchRouter } from "../modules/search/search.routes";
import { workspacesRouter } from "../modules/workspaces/workspaces.routes";
import { chatThreadsRouter } from "../modules/chat_threads/chat_threads.routes";
import { savedSearchesRouter } from "../modules/saved_searches/saved_searches.routes";

export const apiRouter = Router();

apiRouter.use("/workspaces", workspacesRouter);
apiRouter.use("/notes", notesRouter);
apiRouter.use("/documents", documentsRouter);
apiRouter.use("/chat", chatRouter);
apiRouter.use("/chat/stream", chatStreamRouter);
apiRouter.use("/search", searchRouter);
apiRouter.use("/chat-threads", chatThreadsRouter);
apiRouter.use("/saved-searches", savedSearchesRouter);
apiRouter.use("/management", managementRouter);
