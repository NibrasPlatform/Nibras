import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TrackDocument = HydratedDocument<Track>;

@Schema({ timestamps: true, collection: 'tracks' })
export class Track {
  @Prop({ required: true, unique: true, index: true })
  name!: string;

  @Prop({ required: true, unique: true, index: true })
  slug!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const TrackSchema = SchemaFactory.createForClass(Track);
