import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '@modules/auth/auth.module';
import { CoursesModule } from '@modules/courses/courses.module';
import { GamificationModule } from '@modules/gamification/gamification.module';
import {
  CourseSection,
  CourseSectionSchema,
  CourseVideo,
  CourseVideoSchema,
  VideoProgress,
  VideoProgressSchema,
  CourseVideoStats,
  CourseVideoStatsSchema,
  CourseStats,
  CourseStatsSchema,
} from './schemas';
import { SectionsController } from './controllers/sections.controller';
import { VideosController } from './controllers/videos.controller';
import { SectionsService } from './services/sections.service';
import { VideosService } from './services/videos.service';
import { ProgressService } from './services/progress.service';
import { AnalyticsService } from './services/analytics.service';

@Module({
  imports: [
    AuthModule,
    CoursesModule,
    GamificationModule,
    MongooseModule.forFeature([
      { name: CourseSection.name, schema: CourseSectionSchema },
      { name: CourseVideo.name, schema: CourseVideoSchema },
      { name: VideoProgress.name, schema: VideoProgressSchema },
      { name: CourseVideoStats.name, schema: CourseVideoStatsSchema },
      { name: CourseStats.name, schema: CourseStatsSchema },
    ]),
  ],
  controllers: [SectionsController, VideosController],
  providers: [
    SectionsService,
    VideosService,
    ProgressService,
    AnalyticsService,
  ],
  exports: [
    SectionsService,
    VideosService,
    ProgressService,
    AnalyticsService,
    MongooseModule,
  ],
})
export class CourseContentModule {}
