import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CourseVideoStatsDocument = HydratedDocument<CourseVideoStats>;

@Schema({ timestamps: true, collection: 'course_video_stats' })
export class CourseVideoStats {
  @Prop({
    type: Types.ObjectId,
    ref: 'CourseVideo',
    required: true,
    unique: true,
  })
  videoId!: Types.ObjectId;

  @Prop({ default: 0 })
  totalStudents!: number;

  @Prop({ default: 0 })
  watchedCount!: number;

  @Prop({ default: 0 })
  completionRate!: number;

  @Prop({ default: 0 })
  avgProgress!: number;
}

export const CourseVideoStatsSchema =
  SchemaFactory.createForClass(CourseVideoStats);
