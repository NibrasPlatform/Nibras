import { IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CourseLevel } from '@modules/courses/enums/course.enums';

export class SetLevelDto {
  @ApiProperty({ enum: CourseLevel })
  @IsEnum(CourseLevel)
  level!: CourseLevel;
}

export class SetTrackDto {
  @ApiProperty()
  @IsString()
  trackId!: string;
}
