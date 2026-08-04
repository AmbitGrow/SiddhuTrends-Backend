import mongoose from "mongoose";
import { env } from "./env.js";

export const connectDB = async () => {
	try {
		const conn = await mongoose.connect(process.env.MONGO_URI);
		console.log(`MongoDB connected: ${conn.connection.host}`);
	} catch (error) {
		console.log("Error connecting to MONGODB", error.message);
		process.exit(1);
	}
};

export const checkMongoReadiness = async () => {
  if (mongoose.connection.readyState !== 1) {
    return {
      ready: false,
      message: "MongoDB is not connected",
    };
  }

  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });

    if (!hello.setName) {
      return {
        ready: false,
        message: "MongoDB replica set is not initialized",
      };
    }

    if (env.mongoReplicaSetName && hello.setName !== env.mongoReplicaSetName) {
      return {
        ready: false,
        message: `MongoDB replica set mismatch: expected ${env.mongoReplicaSetName}, got ${hello.setName}`,
      };
    }

    if (hello.isWritablePrimary !== true) {
      return {
        ready: false,
        message: "MongoDB node is not writable",
      };
    }

    if (hello.logicalSessionTimeoutMinutes == null) {
      return {
        ready: false,
        message: "MongoDB sessions are not available",
      };
    }

    return {
      ready: true,
      message: "MongoDB is transaction-ready",
    };
  } catch (error) {
    return {
      ready: false,
      message: `MongoDB readiness check failed: ${error.message}`,
    };
  }
};
