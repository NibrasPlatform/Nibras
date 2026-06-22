import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { VideoProvider } from '../enums/course-content.enums';

export type CourseVideoDocument = HydratedDocument<CourseVideo>;

@Schema({ _id: false })
export class VideoResource {
  @Prop({ required: true })
  label!: string;

  @Prop({ required: true })
  url!: string;

  @Prop({ default: '' })
  type!: string;
}

@Schema({ timestamps: true, collection: 'course_videos' })
export class CourseVideo {
  @Prop({
    type: Types.ObjectId,
    ref: 'CourseSection',
    required: true,
    index: true,
  })
  sectionId!: Types.ObjectId;

  @Prop({ required: true })
  title!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ type: String, enum: VideoProvider, required: true })
  provider!: VideoProvider;

  @Prop({ required: true })
  externalId!: string;

  @Prop({ required: true })
  embedUrl!: string;

  @Prop({ default: 0 })
  durationSeconds!: number;

  @Prop({ default: 0 })
  sortOrder!: number;

  @Prop({ default: true })
  isPublished!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'CourseVideo', default: null })
  requiresVideoId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Project', default: null })
  linkedProjectId!: Types.ObjectId | null;

  @Prop({ type: [VideoResource], default: [] })
  resources!: VideoResource[];

  @Prop({ default: false })
  isDeleted!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;
}

export const CourseVideoSchema = SchemaFactory.createForClass(CourseVideo);
CourseVideoSchema.index({ sectionId: 1, sortOrder: 1 });
CourseVideoSchema.index({ sectionId: 1, isDeleted: 1 });
CourseVideoSchema.index({ requiresVideoId: 1 });
