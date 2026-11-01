import mongoose from "mongoose";
import bycrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
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
        // Absence/null means unverified, including pre-feature accounts. These
        // fields stay internal; owner responses expose only a derived boolean.
        emailVerifiedAt: { type: Date, default: null, select: false },
        // Increment on every actual email change, including A -> B -> A, so an
        // old verification link cannot become valid when an address is restored.
        emailVerificationVersion: {
            type: Number, default: 0, min: 0, validate: Number.isSafeInteger, select: false,
        },
        // Account-wide session generation. Future revocation must atomically
        // increment it, never reset it (which could revalidate older tokens).
        // Zero also keeps pre-field accounts compatible without a bulk migration.
        sessionVersion: {
            type: Number,
            default: 0,
            min: 0,
            validate: Number.isSafeInteger,
            select: false, // Internal revocation state, not part of public user data.
        },
    },
        {timestamps: true} //automatically add createdAt and updatedAt fields
);

//instance method: check a plaintext password against the stored hash.
// We attach it to the schema so any user document can call user.comparePassword(...)
userSchema.methods.comparePassword = function(candidatePassword) {
    return bycrypt.compare(candidatePassword, this.passwordHash);
};
 
const User = mongoose.model('User', userSchema);

export default User;
