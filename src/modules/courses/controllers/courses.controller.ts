import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@common/decorators/auth.decorators';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { RolesGuard, SessionAuthGuard } from '@common/guards/auth.guards';
import type { AuthenticatedUser } from '@modules/auth/types/authenticated-user.type';
import {
  AddCourseMemberDto,
  CreateCourseDto,
  EnrollCourseDto,
  UpdateCourseDto,
} from '../dto/courses.dto';
import { CoursesService } from '../services/courses.service';
import { EnrollmentRequestStatus } from '../enums/course.enums';

@ApiTags('courses')
@ApiBearerAuth('session')
@ApiCookieAuth('nibras_web_session')
@Controller('courses')
@UseGuards(SessionAuthGuard)
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  @ApiOperation({ summary: 'List courses for the current user' })
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.coursesService.listMyCourses(user);
  }

  @Get('browse')
  @ApiOperation({ summary: 'Browse public courses' })
  browse(@CurrentUser() user: AuthenticatedUser) {
    return this.coursesService.browsePublicCourses(user);
  }

  @Get('pending')
  @ApiOperation({ summary: 'List courses with pending enrollment requests' })
  listPending(@CurrentUser() user: AuthenticatedUser) {
    return this.coursesService.listPendingEnrollments(user);
  }

  @Get(':courseId/enrollment-requests')
  @ApiOperation({
    summary: 'List enrollment requests for a course (instructor)',
  })
  @ApiQuery({ name: 'status', required: false, enum: EnrollmentRequestStatus })
  listEnrollmentRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Query('status') status?: EnrollmentRequestStatus,
  ) {
    return this.coursesService.listEnrollmentRequests(user, courseId, status);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('instructor', 'admin', 'super-admin')
  @ApiOperation({ summary: 'Create a course (creator becomes instructor)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCourseDto) {
    return this.coursesService.createCourse(user, dto);
  }

  @Get(':courseId')
  @ApiOperation({ summary: 'Get course detail' })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
  ) {
    return this.coursesService.getCourseDetail(user, courseId);
  }

  @Patch(':courseId')
  @UseGuards(RolesGuard)
  @Roles('instructor', 'admin', 'super-admin')
  @ApiOperation({ summary: 'Update course settings (instructor)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.coursesService.updateCourse(user, courseId, dto);
  }

  @Post(':courseId/enroll')
  @ApiOperation({ summary: 'Enroll in a course' })
  enroll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Body() dto: EnrollCourseDto,
  ) {
    return this.coursesService.enroll(user, courseId, dto.message);
  }

  @Get(':courseId/members')
  @ApiOperation({ summary: 'List course members (instructor)' })
  listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
  ) {
    return this.coursesService.listMembers(user, courseId);
  }

  @Post(':courseId/members')
  @ApiOperation({ summary: 'Add or update course member (instructor)' })
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Body() dto: AddCourseMemberDto,
  ) {
    return this.coursesService.addMember(user, courseId, dto);
  }

  @Post(':courseId/enrollment-requests/:requestId/approve')
  @ApiOperation({ summary: 'Approve enrollment request (instructor)' })
  approveEnrollment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.coursesService.approveEnrollment(user, courseId, requestId);
  }
}
