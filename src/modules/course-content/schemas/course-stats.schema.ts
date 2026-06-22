import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CourseStatsDocument = HydratedDocument<CourseStats>;

@Schema({ timestamps: true, collection: 'course_stats' })
export class CourseStats {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true, unique: true })
  courseId!: Types.ObjectId;

  @Prop({ default: 0 })
  totalStudents!: number;

  @Prop({ default: 0 })
  completionRate!: number;

  @Prop({ default: 0 })
  averageProgress!: number;

  @Prop({ default: 0 })
  activeStudentsLast30Days!: number;
}

export const CourseStatsSchema = SchemaFactory.createForClass(CourseStats);
