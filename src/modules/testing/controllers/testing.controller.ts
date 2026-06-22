import {
  Body,
  Controller,
  Logger,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@common/decorators/auth.decorators';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { RolesGuard, SessionAuthGuard } from '@common/guards/auth.guards';
import type { AuthenticatedUser } from '@modules/auth/types/authenticated-user.type';
import { CourseLevel } from '@modules/courses/enums/course.enums';
import { SetLevelDto, SetTrackDto } from '../dto/testing.dto';
import { TestingService } from '../services/testing.service';

@ApiTags('testing')
@ApiBearerAuth('session')
@ApiCookieAuth('nibras_web_session')
@Controller('testing')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('admin', 'super-admin')
export class TestingController {
  private readonly logger = new Logger(TestingController.name);

  constructor(private readonly testingService: TestingService) {}

  @Post('videos/:videoId/complete/:userId')
  @ApiOperation({ summary: '[TESTING] Mark a video as complete for a user' })
  async completeVideo(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('videoId') videoId: string,
    @Param('userId') userId: string,
  ) {
    this.logger.warn(
      `[TESTING] Admin ${admin.id} completed video ${videoId} for user ${userId}`,
    );
    return this.testingService.completeVideo(admin.id, videoId, userId);
  }

  @Post('courses/:courseId/complete/:userId')
  @ApiOperation({
    summary: '[TESTING] Mark all videos in a course as complete for a user',
  })
  async completeCourse(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Param('userId') userId: string,
  ) {
    this.logger.warn(
      `[TESTING] Admin ${admin.id} completed course ${courseId} for user ${userId}`,
    );
    return this.testingService.completeCourse(admin.id, courseId, userId);
  }

  @Post('levels/:level/complete/:userId')
  @ApiOperation({
    summary: '[TESTING] Mark all courses in a level as complete for a user',
  })
  async completeLevel(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('level') level: CourseLevel,
    @Param('userId') userId: string,
  ) {
    this.logger.warn(
      `[TESTING] Admin ${admin.id} completed level ${level} for user ${userId}`,
    );
    return this.testingService.completeLevel(admin.id, level, userId);
  }

  @Post('users/:userId/set-level')
  @ApiOperation({ summary: '[TESTING] Directly set a user level' })
  async setLevel(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: SetLevelDto,
  ) {
    this.logger.warn(
      `[TESTING] Admin ${admin.id} set level to ${dto.level} for user ${userId}`,
    );
    return this.testingService.setLevel(admin.id, userId, dto.level);
  }

  @Post('users/:userId/set-track')
  @ApiOperation({ summary: '[TESTING] Directly set a user track' })
  async setTrack(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: SetTrackDto,
  ) {
    this.logger.warn(
      `[TESTING] Admin ${admin.id} set track ${dto.trackId} for user ${userId}`,
    );
    return this.testingService.setTrack(admin.id, userId, dto.trackId);
  }

  @Post('users/:userId/reset')
  @ApiOperation({ summary: '[TESTING] Reset all progress for a user' })
  async resetProgress(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    this.logger.warn(
      `[TESTING] Admin ${admin.id} reset progress for user ${userId}`,
    );
    return this.testingService.resetProgress(admin.id, userId);
  }
}
