import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { AdminOverrideTrackDto, SelectTrackDto } from '../dto/courses.dto';
import { TrackService } from '../services/track.service';
import { ProgressionService } from '../services/progression.service';

@ApiTags('tracks')
@ApiBearerAuth('session')
@ApiCookieAuth('nibras_web_session')
@Controller('tracks')
@UseGuards(SessionAuthGuard)
export class TracksController {
  constructor(
    private readonly trackService: TrackService,
    private readonly progression: ProgressionService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all active tracks' })
  findAll() {
    return this.trackService.findAll();
  }

  @Post('select')
  @ApiOperation({
    summary: 'Select a track (one-time, requires Intermediate completion)',
  })
  selectTrack(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SelectTrackDto,
  ) {
    return this.trackService.selectTrack(user, dto.trackId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Create a track' })
  createTrack(
    @Body() dto: { name: string; slug: string; description?: string },
  ) {
    return this.trackService.create(dto);
  }

  @Patch(':trackId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Update a track' })
  updateTrack(
    @Param('trackId') trackId: string,
    @Body()
    dto: {
      name?: string;
      slug?: string;
      description?: string;
      isActive?: boolean;
    },
  ) {
    return this.trackService.update(trackId, dto);
  }

  @Post('admin/override/:userId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Admin override student track' })
  adminOverrideTrack(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: AdminOverrideTrackDto,
  ) {
    return this.progression.adminOverrideTrack(
      admin.id,
      userId,
      dto.trackId ?? null,
    );
  }

  @Post('admin/recalculate/:userId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Admin recalculate student progression' })
  adminRecalculate(@Param('userId') userId: string) {
    return this.progression.adminRecalculate(userId);
  }
}
