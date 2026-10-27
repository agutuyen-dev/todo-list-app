import "dotenv/config";
import express from "express";
import cors from "cors";
import authRouter from "./routes/auth";
import todosRouter from "./routes/todos";
import categoriesRouter from "./routes/categories";
import { errorHandler, notFoundHandler } from "./utils/errors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/todos", todosRouter);
app.use("/api/categories", categoriesRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

export default app;
