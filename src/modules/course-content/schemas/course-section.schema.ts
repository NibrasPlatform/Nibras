import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CourseSectionDocument = HydratedDocument<CourseSection>;

@Schema({ timestamps: true, collection: 'course_sections' })
export class CourseSection {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true, index: true })
  courseId!: Types.ObjectId;

  @Prop({ required: true })
  title!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ default: 0 })
  sortOrder!: number;

  @Prop({ default: true })
  isPublished!: boolean;

  @Prop({ default: false })
  isDeleted!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;
}

export const CourseSectionSchema = SchemaFactory.createForClass(CourseSection);
CourseSectionSchema.index({ courseId: 1, sortOrder: 1 });
CourseSectionSchema.index({ courseId: 1, isDeleted: 1 });
