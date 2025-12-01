import { defineApp } from "convex/server";

const app = defineApp();

app.use(require("./convex").default);

export default app;
