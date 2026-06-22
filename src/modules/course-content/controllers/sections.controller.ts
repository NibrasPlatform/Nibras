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
  CreateSectionDto,
  UpdateSectionDto,
  ReorderSectionsDto,
} from '../dto/course-content.dto';
import { SectionsService } from '../services/sections.service';

@ApiTags('course-sections')
@ApiBearerAuth('session')
@ApiCookieAuth('nibras_web_session')
@Controller('courses/:courseId/sections')
@UseGuards(SessionAuthGuard)
export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) {}

  @Get()
  @ApiOperation({ summary: 'List sections with nested videos' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
  ) {
    return this.sectionsService.list(user, courseId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('instructor', 'admin', 'super-admin')
  @ApiOperation({ summary: 'Create a section (instructor)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Body() dto: CreateSectionDto,
  ) {
    return this.sectionsService.create(user, courseId, dto);
  }

  @Patch(':sectionId')
  @UseGuards(RolesGuard)
  @Roles('instructor', 'admin', 'super-admin')
  @ApiOperation({ summary: 'Update a section (instructor)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: UpdateSectionDto,
  ) {
    return this.sectionsService.update(user, courseId, sectionId, dto);
  }

  @Delete(':sectionId')
  @UseGuards(RolesGuard)
  @Roles('instructor', 'admin', 'super-admin')
  @ApiOperation({
    summary: 'Delete a section (instructor, soft delete + cascade)',
  })
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
  ) {
    return this.sectionsService.delete(user, courseId, sectionId);
  }

  @Patch('reorder')
  @UseGuards(RolesGuard)
  @Roles('instructor', 'admin', 'super-admin')
  @ApiOperation({ summary: 'Bulk reorder sections (instructor)' })
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Body() dto: ReorderSectionsDto,
  ) {
    return this.sectionsService.reorder(user, courseId, dto);
  }
}
