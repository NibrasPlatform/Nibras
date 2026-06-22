import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

export class CreateThreadDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateThreadDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  body?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
