import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type VideoProgressDocument = HydratedDocument<VideoProgress>;

@Schema({ timestamps: true, collection: 'video_progress' })
export class VideoProgress {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CourseVideo', required: true })
  videoId!: Types.ObjectId;

  @Prop({ default: false })
  watched!: boolean;

  @Prop({ default: 0 })
  watchedProgress!: number;

  @Prop({ default: 0 })
  lastPositionSeconds!: number;

  @Prop({ type: Date, default: Date.now })
  updatedAt!: Date;
}

export const VideoProgressSchema = SchemaFactory.createForClass(VideoProgress);
VideoProgressSchema.index({ userId: 1, videoId: 1 }, { unique: true });
VideoProgressSchema.index({ videoId: 1 });
VideoProgressSchema.index({ updatedAt: 1 });
