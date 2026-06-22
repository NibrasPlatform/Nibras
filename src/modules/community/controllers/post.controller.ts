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
import { PostService } from '../services/post.service';
import { ThreadService } from '../services/thread.service';
import { CourseService } from '../services/course.service';
import { CreatePostDto, UpdatePostDto } from '../dto/post.dto';
import { PaginationQueryDto } from '../dto/pagination-query.dto';
import { PopulatedThread } from '../interfaces/populated.types';

type RequestWithUser = Request & { user: AuthenticatedUser };

@ApiTags('Posts')
@UseGuards(SessionAuthGuard)
@Controller('posts')
export class PostController {
  constructor(
    private postService: PostService,
    private threadService: ThreadService,
    private courseService: CourseService,
  ) {}

  private getThreadCourseId(thread: {
    course: PopulatedThread['course'];
  }): string {
    return typeof thread.course === 'object' && '_id' in thread.course
      ? String(thread.course._id)
      : String(thread.course);
  }

  @Post(':threadId')
  @ApiOperation({ summary: 'Create a post in a thread' })
  async create(
    @Param('threadId') threadId: string,
    @Body() dto: CreatePostDto,
    @Req() req: RequestWithUser,
  ) {
    if (!isValidObjectId(threadId))
      throw new BadRequestException('Invalid thread ID');
    const thread = await this.threadService.findById(threadId);
    if (!thread) throw new NotFoundException('Thread not found');
    const courseId = this.getThreadCourseId(thread);
    if (!(await this.courseService.isEnrolled(req.user, courseId))) {
      throw new ForbiddenException(
        'You must be enrolled in this course to post a reply',
      );
    }
    const post = await this.postService.create({
      body: dto.body,
      thread: threadId,
      author: req.user.id,
    });
    return {
      success: true,
      message: 'Post created successfully',
      data: { post },
    };
  }

  @Get('thread/:threadId')
  @ApiOperation({ summary: 'List posts in a thread' })
  async findByThread(
    @Param('threadId') threadId: string,
    @Query() query: PaginationQueryDto,
  ) {
    if (!isValidObjectId(threadId))
      throw new BadRequestException('Invalid thread ID');
    const result = await this.postService.findByThread(
      threadId,
      query.page,
      query.limit,
    );
    return {
      success: true,
      message: 'Posts fetched successfully',
      data: result,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get post by ID' })
  async findById(@Param('id') id: string) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid post ID');
    const post = await this.postService.findById(id);
    if (!post) throw new NotFoundException('Post not found');
    return {
      success: true,
      message: 'Post fetched successfully',
      data: { post },
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update post' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
    @Req() req: RequestWithUser,
  ) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid post ID');
    const post = await this.postService.findById(id);
    if (!post) throw new NotFoundException('Post not found');
    if (
      String(
        (post as unknown as { author?: { _id?: unknown } }).author?._id ??
          (post as unknown as { author?: unknown }).author,
      ) !== req.user.id
    ) {
      throw new ForbiddenException('You are not allowed to update this post');
    }
    const updated = await this.postService.update(id, dto);
    return {
      success: true,
      message: 'Post updated successfully',
      data: { post: updated },
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete post' })
  async delete(@Param('id') id: string, @Req() req: RequestWithUser) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid post ID');
    const post = await this.postService.findById(id);
    if (!post) throw new NotFoundException('Post not found');
    const postAuthorId = String(
      (post as unknown as { author?: { _id?: unknown } }).author?._id ??
        (post as unknown as { author?: unknown }).author,
    );
    const isAuthor = postAuthorId === req.user.id;
    const roleName = req.user.role.toLowerCase();
    const isAdminOrInstructor = ['admin', 'super admin', 'instructor'].includes(
      roleName,
    );
    if (!isAuthor && !isAdminOrInstructor) {
      throw new ForbiddenException('You are not allowed to delete this post');
    }
    await this.postService.delete(id);
    return { success: true, message: 'Post deleted successfully' };
  }

  @Patch(':id/pin')
  @ApiOperation({ summary: 'Pin post' })
  async pin(@Param('id') id: string) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid post ID');
    const post = await this.postService.findById(id);
    if (!post) throw new NotFoundException('Post not found');
    const updated = await this.postService.pin(id);
    return {
      success: true,
      message: 'Post pinned successfully',
      data: { post: updated },
    };
  }

  @Patch(':id/accept')
  @ApiOperation({ summary: 'Accept post as answer' })
  async accept(@Param('id') id: string, @Req() req: RequestWithUser) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid post ID');
    const post = await this.postService.accept(id, req.user.id);
    return {
      success: true,
      message: 'Post accepted successfully',
      data: { post },
    };
  }
}
