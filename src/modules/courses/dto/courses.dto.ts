import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  Matches,
} from 'class-validator';
import { CourseRole, EnrollmentRequestStatus } from '../enums/course.enums';

export class CreateCourseDto {
  @ApiProperty({ example: 'cs106l-fall-2026' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: 'Fall 2026' })
  @IsString()
  @MaxLength(80)
  termLabel!: string;

  @ApiProperty({ example: 'CS106L' })
  @IsString()
  @MaxLength(40)
  courseCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class EnrollCourseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class AddCourseMemberDto {
  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiProperty({ enum: CourseRole })
  @IsEnum(CourseRole)
  role!: CourseRole;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  level?: number;
}

export class CourseSummaryDto {
  id!: string;
  slug!: string;
  title!: string;
  termLabel!: string;
  courseCode!: string;
  description?: string;
  isPublic!: boolean;
  role?: CourseRole;
}

export class CourseMemberDto {
  userId!: string;
  username?: string;
  role!: CourseRole;
  level!: number;
}

export class EnrollmentRequestDto {
  id!: string;
  courseId!: string;
  userId!: string;
  status!: EnrollmentRequestStatus;
  message?: string;
  createdAt!: string;
}

export class UpdateCourseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sequentialVideos?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string | null;

  @ApiPropertyOptional({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        week: { type: 'number' },
        title: { type: 'string' },
        description: { type: 'string' },
      },
    },
  })
  @IsOptional()
  syllabus?: Array<{ week: number; title: string; description: string }>;
}

export class SelectTrackDto {
  @ApiProperty()
  @IsString()
  trackId!: string;
}

export class AdminOverrideTrackDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  trackId?: string | null;
}
