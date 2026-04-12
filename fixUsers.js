import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./models/user.model.js";

dotenv.config();

const fixUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const result = await User.updateMany(
      { isDeleted: { $exists: false } },
      { $set: { isDeleted: false } }
    );

    console.log("Update Result:", result);

    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

fixUsers();
