import moongose from 'mongoose'

// A sub-schema for an embedded member. Each member links a user to a role.
// We don't make this its own collection — members live INSIDE the board doc.

const MemberSchema = new moongose.Schema({
    user: {
        type: moongose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    role: {
        type: String,
        enum: ['owner', 'editor', 'viewer'],
        default: 'viewer'
    },
}, { _id: false });// disable _id for subdocuments since we won't need it   

const BoardSchema = new moongose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
    },
    owner: {
        type: moongose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    members: [MemberSchema], // an array of members (sub-documents)
}, { timestamps: true }
);

// Index: "find all boards where a given user is a member" — our most common query.
boardSchema.index({ 'members.user': 1 });

const Board = moongose.model('Board', BoardSchema);
export default Board;