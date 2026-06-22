import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { RolesGuard, SessionAuthGuard } from '@common/guards/auth.guards';
import { Roles } from '@common/decorators/auth.decorators';
import type { AuthenticatedUser } from '@modules/auth/types/authenticated-user.type';
import {
  CreateVideoDto,
  UpdateVideoDto,
  UpdateProgressDto,
  ReorderVideosDto,
} from '../dto/course-content.dto';
import { VideosService } from '../services/videos.service';
import { ProgressService } from '../services/progress.service';
import { AnalyticsService } from '../services/analytics.service';

@ApiTags('course-videos')
@ApiBearerAuth('session')
@ApiCookieAuth('nibras_web_session')
@Controller('courses/:courseId')
@UseGuards(SessionAuthGuard)
export class VideosController {
  constructor(
    private readonly videosService: VideosService,
    private readonly progressService: ProgressService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Post('sections/:sectionId/videos')
  @UseGuards(RolesGuard)
  @Roles('instructor', 'admin', 'super-admin')
  @ApiOperation({ summary: 'Create a video in a section (instructor)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: CreateVideoDto,
  ) {
    return this.videosService.create(user, courseId, sectionId, dto);
  }

  @Patch('videos/:videoId')
  @UseGuards(RolesGuard)
  @Roles('instructor', 'admin', 'super-admin')
  @ApiOperation({ summary: 'Update a video (instructor)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Param('videoId') videoId: string,
    @Body() dto: UpdateVideoDto,
  ) {
    return this.videosService.update(user, courseId, videoId, dto);
  }

  @Delete('videos/:videoId')
  @UseGuards(RolesGuard)
  @Roles('instructor', 'admin', 'super-admin')
  @ApiOperation({ summary: 'Delete a video (instructor, soft delete)' })
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Param('videoId') videoId: string,
  ) {
    return this.videosService.delete(user, courseId, videoId);
  }

  @Get('videos/analytics')
  @UseGuards(RolesGuard)
  @Roles('instructor', 'admin', 'super-admin')
  @ApiOperation({ summary: 'Get video-level analytics (instructor)' })
  videoAnalytics(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
  ) {
    return this.analyticsService.getVideoAnalytics(user, courseId);
  }

  @Get('analytics')
  @UseGuards(RolesGuard)
  @Roles('instructor', 'admin', 'super-admin')
  @ApiOperation({ summary: 'Get course-level analytics (instructor)' })
  courseAnalytics(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
  ) {
    return this.analyticsService.getCourseAnalytics(user, courseId);
  }

  @Get('videos/:videoId')
  @ApiOperation({ summary: 'Get video detail with student progress' })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Param('videoId') videoId: string,
  ) {
    return this.videosService.detail(user, courseId, videoId);
  }

  @Post('videos/:videoId/progress')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Upsert watch progress for a video' })
  upsertProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Param('videoId') videoId: string,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.progressService.upsertProgress(user, courseId, videoId, dto);
  }

  @Patch('videos/reorder')
  @UseGuards(RolesGuard)
  @Roles('instructor', 'admin', 'super-admin')
  @ApiOperation({ summary: 'Bulk reorder videos (instructor)' })
  reorderVideos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Body() dto: ReorderVideosDto,
  ) {
    return this.videosService.reorder(user, courseId, dto);
  }
}
