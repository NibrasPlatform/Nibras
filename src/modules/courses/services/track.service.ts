import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '@modules/auth/types/authenticated-user.type';
import { User } from '@modules/auth/schemas/user.schema';
import { CourseLevel, CourseEventType } from '../enums/course.enums';
import { Track, TrackDocument } from '../schemas/track.schema';

@Injectable()
export class TrackService {
  private readonly logger = new Logger(TrackService.name);

  constructor(
    @InjectModel(Track.name) private readonly trackModel: Model<Track>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(): Promise<Track[]> {
    return this.trackModel.find({ isActive: true }).sort({ name: 1 }).exec();
  }

  async findById(trackId: string): Promise<TrackDocument> {
    if (!Types.ObjectId.isValid(trackId)) {
      throw new BadRequestException({
        code: 'INVALID_TRACK_ID',
        message: 'Invalid track ID',
      });
    }

    const track = await this.trackModel.findById(trackId).exec();
    if (!track) {
      throw new NotFoundException({
        code: 'TRACK_NOT_FOUND',
        message: 'Track not found',
      });
    }

    return track;
  }

  async create(data: {
    name: string;
    slug: string;
    description?: string;
  }): Promise<Track> {
    return this.trackModel.create({
      name: data.name,
      slug: data.slug,
      description: data.description ?? '',
      isActive: true,
    });
  }

  async update(
    trackId: string,
    data: {
      name?: string;
      slug?: string;
      description?: string;
      isActive?: boolean;
    },
  ): Promise<TrackDocument> {
    const track = await this.findById(trackId);
    if (data.name !== undefined) track.name = data.name;
    if (data.slug !== undefined) track.slug = data.slug;
    if (data.description !== undefined) track.description = data.description;
    if (data.isActive !== undefined) track.isActive = data.isActive;
    return track.save();
  }

  async selectTrack(user: AuthenticatedUser, trackId: string): Promise<void> {
    const track = await this.findById(trackId);

    const userDoc = await this.userModel.findById(user.id).exec();
    if (!userDoc) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    if (userDoc.selectedTrackId) {
      throw new BadRequestException({
        code: 'TRACK_ALREADY_SELECTED',
        message: 'You have already selected a track and cannot change it',
      });
    }

    const advancedIdx = [
      CourseLevel.Beginner,
      CourseLevel.Intermediate,
      CourseLevel.Advanced,
      CourseLevel.Expert,
    ].indexOf(CourseLevel.Advanced);

    const userIdx = [
      CourseLevel.Beginner,
      CourseLevel.Intermediate,
      CourseLevel.Advanced,
      CourseLevel.Expert,
    ].indexOf(userDoc.currentLevel);

    if (userIdx < advancedIdx) {
      throw new BadRequestException({
        code: 'INTERMEDIATE_NOT_COMPLETED',
        message:
          'You must complete the Intermediate level before selecting a track',
      });
    }

    userDoc.selectedTrackId = track._id;
    await userDoc.save();

    try {
      await this.eventEmitter.emitAsync(CourseEventType.TrackSelected, {
        userId: user.id,
        level: userDoc.currentLevel,
        trackId: track._id.toString(),
      });
    } catch (err) {
      this.logger.error(
        `Event emission failed for track selection: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
