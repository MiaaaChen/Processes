import express from "express";
import mongoose from "mongoose";
import passport from "passport";
import initializePassport from "@src/config/passport";
import { MONGO_URI } from "@src/config/config";
import authRoutes from "@src/routes/authRoutes";
import userRoutes from "@src/routes/userRoutes";
import postRoutes from "@src/routes/postRoutes";
import commentRoutes from "@src/routes/commentRoutes";
import searchRoutes from "@src/routes/searchRoutes";
import eventRoutes from "@src/routes/eventRoutes";
import { setupElasticsearch } from '@src/utils/elasticSearchSetup';

// import swaggerJsdoc from "swagger-jsdoc";
// import swaggerUi from "swagger-ui-express";
// import swaggerOptions from "@src/swaggerOptions";
import cors from "cors";
import path from "path";

const app = express();

// middleware
app.use(express.json());
app.use(cors());

initializePassport(passport); // 初始化 Passport
app.use(passport.initialize());

// const swaggerSpec = swaggerJsdoc(swaggerOptions);
// app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 在 MongoDB 連接成功後調用
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB 已連接");
    setupElasticsearch();  // 初始化 Elasticsearch
  })
  .catch((err) => console.log(err));

// routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/post", postRoutes);
app.use("/api/comment", commentRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/event", eventRoutes);


app.use(express.static(path.join(__dirname, "../../../frontend/build")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../../../frontend/build", "index.html"));
});


export default app;
