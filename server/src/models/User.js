import mongoose from "mongoose";
import bycrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [ture, 'Name is required'],
            trim: true,   //strips accidental leading/trailing spaces
        }, 
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true, //enforce unique emails at the DB level
            lowercase: true, //store all emails in lowercase for consistency
            trim: true,
        },
        passwordHash: {
            type: String, 
            required: true,
            select: false, // never return this field in queries by default
        },
    },
        {timestamps: true} //automatically add createdAt and updatedAt fields
);

//instance method: check a plaintext password against the stored hash.
// We attach it to the schema so any user document can call user.comparePassword(...)
userSchema.methods.comparePassword = function(candidatePassword) {
    return bycrypt.compare(candidatePassword, this.passwordHash);
};

const User = moongoose.model('User', userSchema);

export default User;