import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';
import { isValidObjectId } from 'mongoose';
import { SessionAuthGuard } from '@common/guards/auth.guards';
import type { AuthenticatedUser } from '@modules/auth/types/authenticated-user.type';
import { ThreadService } from '../services/thread.service';
import { CourseService } from '../services/course.service';
import { CreateThreadDto, UpdateThreadDto } from '../dto/thread.dto';
import { PaginationQueryDto } from '../dto/pagination-query.dto';
import { PopulatedThread } from '../interfaces/populated.types';

type RequestWithUser = Request & { user: AuthenticatedUser };
type PopulatedThreadResult = Omit<PopulatedThread, 'tags'> & { tags: string[] };

@ApiTags('Threads')
@UseGuards(SessionAuthGuard)
@Controller('threads')
export class ThreadController {
  constructor(
    private threadService: ThreadService,
    private courseService: CourseService,
  ) {}

  private getRoleName(user: AuthenticatedUser): string {
    return user.role.toLowerCase();
  }

  private getCourseId(thread: PopulatedThreadResult): string {
    return typeof thread.course === 'object' && '_id' in thread.course
      ? String(thread.course._id)
      : String(thread.course);
  }

  private getAuthorId(thread: PopulatedThreadResult): string {
    return typeof thread.author === 'object' && '_id' in thread.author
      ? String(thread.author._id)
      : String(thread.author);
  }

  @Post(':courseId')
  @ApiOperation({ summary: 'Create a thread in a course' })
  async create(
    @Param('courseId') courseId: string,
    @Body() dto: CreateThreadDto,
    @Req() req: RequestWithUser,
  ) {
    if (!isValidObjectId(courseId))
      throw new BadRequestException('Invalid course ID');
    if (!(await this.courseService.isEnrolled(req.user, courseId))) {
      throw new ForbiddenException(
        'You must be enrolled in this course to create a thread',
      );
    }
    const thread = await this.threadService.create({
      ...dto,
      course: courseId,
      author: req.user.id,
    });
    return {
      success: true,
      message: 'Thread created successfully',
      data: { thread },
    };
  }

  @Get('course/:courseId')
  @ApiOperation({ summary: 'List threads in a course' })
  async findByCourse(
    @Param('courseId') courseId: string,
    @Query()
    query: PaginationQueryDto & {
      search?: string;
      status?: string;
      tag?: string;
    },
    @Req() req: RequestWithUser,
  ) {
    if (!isValidObjectId(courseId))
      throw new BadRequestException('Invalid course ID');
    if (!(await this.courseService.isEnrolled(req.user, courseId))) {
      throw new ForbiddenException(
        'You must be enrolled in this course to view threads',
      );
    }
    const result = await this.threadService.findByCourse(courseId, query);
    return {
      success: true,
      message: 'Threads fetched successfully',
      data: result,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get thread by ID' })
  async findById(@Param('id') id: string, @Req() req: RequestWithUser) {
    if (!isValidObjectId(id))
      throw new BadRequestException('Invalid thread ID');
    const thread = await this.threadService.findById(id);
    if (!thread) throw new NotFoundException('Thread not found');
    const courseId = this.getCourseId(thread);
    if (!(await this.courseService.isEnrolled(req.user, courseId))) {
      throw new ForbiddenException(
        'You must be enrolled in this course to view this thread',
      );
    }
    return {
      success: true,
      message: 'Thread fetched successfully',
      data: { thread },
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update thread' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateThreadDto,
    @Req() req: RequestWithUser,
  ) {
    if (!isValidObjectId(id))
      throw new BadRequestException('Invalid thread ID');
    const thread = await this.threadService.findById(id);
    if (!thread) throw new NotFoundException('Thread not found');
    const courseId = this.getCourseId(thread);
    const authorId = this.getAuthorId(thread);
    const roleName = this.getRoleName(req.user);
    if (
      roleName !== 'admin' &&
      roleName !== 'super admin' &&
      String(authorId) !== String(req.user.id)
    ) {
      throw new ForbiddenException('You are not allowed to update this thread');
    }
    if (!(await this.courseService.isEnrolled(req.user, courseId))) {
      throw new ForbiddenException(
        'You must be enrolled in this course to update a thread',
      );
    }
    const updated = await this.threadService.update(id, dto);
    return {
      success: true,
      message: 'Thread updated successfully',
      data: { thread: updated },
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete thread' })
  async delete(@Param('id') id: string, @Req() req: RequestWithUser) {
    if (!isValidObjectId(id))
      throw new BadRequestException('Invalid thread ID');
    const thread = await this.threadService.findById(id);
    if (!thread) throw new NotFoundException('Thread not found');
    const authorId = this.getAuthorId(thread);
    const isAuthor = String(authorId) === String(req.user.id);
    const roleName = this.getRoleName(req.user);
    const isAdmin = roleName === 'admin' || roleName === 'super admin';
    const isInstructor =
      roleName === 'instructor' &&
      (await this.courseService.isEnrolled(req.user, this.getCourseId(thread)));
    if (!isAuthor && !isAdmin && !isInstructor) {
      throw new ForbiddenException('You are not allowed to delete this thread');
    }
    await this.threadService.delete(id);
    return { success: true, message: 'Thread deleted successfully' };
  }

  @Patch(':id/pin')
  @ApiOperation({ summary: 'Pin thread' })
  async pin(@Param('id') id: string) {
    if (!isValidObjectId(id))
      throw new BadRequestException('Invalid thread ID');
    const updated = await this.threadService.pin(id);
    return {
      success: true,
      message: 'Thread pinned successfully',
      data: { thread: updated },
    };
  }

  @Patch(':id/unpin')
  @ApiOperation({ summary: 'Unpin thread' })
  async unpin(@Param('id') id: string) {
    if (!isValidObjectId(id))
      throw new BadRequestException('Invalid thread ID');
    const updated = await this.threadService.unpin(id);
    return {
      success: true,
      message: 'Thread unpinned successfully',
      data: { thread: updated },
    };
  }

  @Patch(':id/close')
  @ApiOperation({ summary: 'Close thread' })
  async close(@Param('id') id: string, @Req() req: RequestWithUser) {
    if (!isValidObjectId(id))
      throw new BadRequestException('Invalid thread ID');
    const thread = await this.threadService.findById(id);
    if (!thread) throw new NotFoundException('Thread not found');
    const authorId = this.getAuthorId(thread);
    const isAuthor = String(authorId) === String(req.user.id);
    const roleName = this.getRoleName(req.user);
    const isAdmin = roleName === 'admin' || roleName === 'super admin';
    const isInstructor =
      roleName === 'instructor' &&
      (await this.courseService.isEnrolled(req.user, this.getCourseId(thread)));
    if (!isAuthor && !isAdmin && !isInstructor) {
      throw new ForbiddenException('You are not allowed to close this thread');
    }
    const updated = await this.threadService.close(id);
    return {
      success: true,
      message: 'Thread closed successfully',
      data: { thread: updated },
    };
  }

  @Patch(':id/open')
  @ApiOperation({ summary: 'Open thread' })
  async open(@Param('id') id: string) {
    if (!isValidObjectId(id))
      throw new BadRequestException('Invalid thread ID');
    const updated = await this.threadService.open(id);
    return {
      success: true,
      message: 'Thread opened successfully',
      data: { thread: updated },
    };
  }
}
