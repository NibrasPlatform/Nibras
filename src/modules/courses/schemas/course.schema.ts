import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CourseLevel } from '../enums/course.enums';

export type CourseDocument = HydratedDocument<Course>;

@Schema({ timestamps: true, collection: 'courses' })
export class Course {
  @Prop({ required: true, unique: true, index: true })
  slug!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  termLabel!: string;

  @Prop({ required: true })
  courseCode!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ default: false })
  isPublic!: boolean;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  @Prop({ type: String, enum: CourseLevel, default: CourseLevel.Beginner })
  level!: CourseLevel;

  @Prop({ default: 0 })
  sortOrder!: number;

  @Prop({ type: Types.ObjectId, default: null })
  trackId!: Types.ObjectId | null;

  @Prop({ default: false })
  sequentialVideos!: boolean;

  @Prop({ type: String, default: null })
  thumbnailUrl!: string | null;

  @Prop({
    type: [
      {
        week: { type: Number },
        title: { type: String },
        description: { type: String },
      },
    ],
    default: [],
  })
  syllabus!: Array<{ week: number; title: string; description: string }>;
}

export const CourseSchema = SchemaFactory.createForClass(Course);
CourseSchema.index({ isPublic: 1, isActive: 1, deletedAt: 1 });
