import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '@modules/auth/auth.module';
import { GamificationModule } from '@modules/gamification/gamification.module';
import { User, UserSchema } from '@modules/auth/schemas/user.schema';
import {
  Course,
  CourseSchema,
  CourseEnrollmentRequest,
  CourseEnrollmentRequestSchema,
  CourseMembership,
  CourseMembershipSchema,
} from './schemas';
import { Track, TrackSchema } from './schemas/track.schema';
import { CoursesController } from './controllers/courses.controller';
import { TracksController } from './controllers/tracks.controller';
import { CoursesService } from './services/courses.service';
import { CourseAccessService } from './services/course-access.service';
import { ProgressionService } from './services/progression.service';
import { TrackService } from './services/track.service';

@Module({
  imports: [
    AuthModule,
    GamificationModule,
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: CourseMembership.name, schema: CourseMembershipSchema },
      {
        name: CourseEnrollmentRequest.name,
        schema: CourseEnrollmentRequestSchema,
      },
      { name: User.name, schema: UserSchema },
      { name: Track.name, schema: TrackSchema },
    ]),
  ],
  controllers: [CoursesController, TracksController],
  providers: [
    CoursesService,
    CourseAccessService,
    ProgressionService,
    TrackService,
  ],
  exports: [
    CoursesService,
    CourseAccessService,
    ProgressionService,
    TrackService,
    MongooseModule,
  ],
})
export class CoursesModule {}
