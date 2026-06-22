import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { VideoProvider } from '../enums/course-content.enums';

export class CreateSectionDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateSectionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class ResourceDto {
  @ApiProperty()
  @IsString()
  label!: string;

  @ApiProperty()
  @IsString()
  @IsUrl()
  url!: string;

  @ApiPropertyOptional({ default: '' })
  @IsOptional()
  @IsString()
  type?: string;
}

export class CreateVideoDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ enum: VideoProvider })
  @IsEnum(VideoProvider)
  provider!: VideoProvider;

  @ApiProperty()
  @IsString()
  externalId!: string;

  @ApiProperty()
  @IsString()
  @IsUrl({ require_protocol: false })
  embedUrl!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  requiresVideoId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  linkedProjectId?: string | null;

  @ApiPropertyOptional({ type: [ResourceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResourceDto)
  resources?: ResourceDto[];
}

export class UpdateVideoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: VideoProvider })
  @IsOptional()
  @IsEnum(VideoProvider)
  provider?: VideoProvider;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: false })
  embedUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  requiresVideoId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  linkedProjectId?: string | null;

  @ApiPropertyOptional({ type: [ResourceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResourceDto)
  resources?: ResourceDto[];
}

export class UpdateProgressDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  watched?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  watchedProgress?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  lastPositionSeconds?: number;
}

export class ReorderSectionItemDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderSectionsDto {
  @ApiProperty({ type: [ReorderSectionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderSectionItemDto)
  sections!: ReorderSectionItemDto[];
}

export class ReorderVideoItemDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderVideosDto {
  @ApiProperty({ type: [ReorderVideoItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderVideoItemDto)
  videos!: ReorderVideoItemDto[];
}

export class SectionResponseDto {
  id!: string;
  courseId!: string;
  title!: string;
  description?: string;
  sortOrder!: number;
  isPublished!: boolean;
  videos?: VideoResponseDto[];
}

export class VideoResponseDto {
  id!: string;
  sectionId!: string;
  title!: string;
  description?: string;
  provider!: VideoProvider;
  externalId!: string;
  embedUrl!: string;
  durationSeconds!: number;
  sortOrder!: number;
  isPublished!: boolean;
  requiresVideoId?: string | null;
  linkedProjectId?: string | null;
  resources?: { label: string; url: string; type: string }[];
  progress?: {
    watched: boolean;
    watchedProgress: number;
    lastPositionSeconds: number;
  };
  locked?: boolean;
}

export class VideoAnalyticsResponseDto {
  videoId!: string;
  title!: string;
  totalStudents!: number;
  watchedCount!: number;
  completionRate!: number;
  avgProgress!: number;
}

export class CourseAnalyticsResponseDto {
  totalStudents!: number;
  completionRate!: number;
  averageProgress!: number;
  activeStudentsLast30Days!: number;
}
