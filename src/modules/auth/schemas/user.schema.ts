import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import { CourseLevel } from '@modules/courses/enums/course.enums';

export type UserDocument = HydratedDocument<User>;

const reputationBreakdownSchema = new MongooseSchema(
  {
    problem: { type: Number, default: 0 },
    community: { type: Number, default: 0 },
    contest: { type: Number, default: 0 },
    course: { type: Number, default: 0 },
  },
  { _id: false },
);

const reputationSchema = new MongooseSchema(
  {
    total: { type: Number, default: 0 },
    breakdown: {
      type: reputationBreakdownSchema,
      default: () => ({ problem: 0, community: 0, contest: 0, course: 0 }),
    },
  },
  { _id: false },
);

const privacySettingsSchema = new MongooseSchema(
  {
    showOnLeaderboard: { type: Boolean, default: true },
  },
  { _id: false },
);

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, unique: true, trim: true })
  username!: string;

  @Prop()
  displayName?: string;

  @Prop()
  avatar?: string;

  @Prop({ type: Types.ObjectId, ref: 'Role', required: true })
  role!: Types.ObjectId;

  @Prop()
  institution?: string;

  @Prop({ default: 0 })
  reputationScore!: number;

  @Prop({
    type: reputationSchema,
    default: () => ({
      total: 0,
      breakdown: { problem: 0, community: 0, contest: 0, course: 0 },
    }),
  })
  reputation!: {
    total: number;
    breakdown: {
      problem: number;
      community: number;
      contest: number;
      course: number;
    };
  };

  @Prop({
    type: privacySettingsSchema,
    default: () => ({ showOnLeaderboard: true }),
  })
  privacySettings!: { showOnLeaderboard: boolean };

  @Prop({ default: false })
  emailVerified!: boolean;

  @Prop({ default: false })
  githubLinked!: boolean;

  @Prop()
  oauthProvider?: string;

  @Prop()
  oauthId?: string;

  @Prop({ type: Object, default: {} })
  preferences!: Record<string, unknown>;

  @Prop()
  lastActive?: Date;

  @Prop({ type: String, enum: CourseLevel, default: CourseLevel.Beginner })
  currentLevel!: CourseLevel;

  @Prop({ type: Types.ObjectId, default: null })
  selectedTrackId!: Types.ObjectId | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
