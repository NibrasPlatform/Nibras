import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'https://avatars.githubusercontent.com/u/1' })
  @IsOptional()
  @IsUrl()
  avatar?: string;

  @ApiPropertyOptional({ example: { theme: 'dark' } })
  @IsOptional()
  @IsObject()
  preferences?: Record<string, unknown>;
}

export class UserProfileResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional()
  displayName?: string;

  @ApiPropertyOptional()
  avatar?: string;

  @ApiProperty()
  role!: string;

  @ApiProperty()
  githubLinked!: boolean;

  @ApiProperty()
  reputationScore!: number;

  @ApiProperty()
  emailVerified!: boolean;

  @ApiPropertyOptional()
  institution?: string;

  @ApiProperty()
  preferences!: Record<string, unknown>;

  @ApiPropertyOptional()
  currentLevel?: string;

  @ApiPropertyOptional({ nullable: true })
  selectedTrackId?: string | null;
}
