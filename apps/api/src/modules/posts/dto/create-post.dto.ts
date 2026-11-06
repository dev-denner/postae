import { IsArray, IsDateString, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { POST_STATUS } from '../../../common/constants/app.constants';

export class CreatePostDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @IsString()
  cta?: string;

  @IsOptional()
  @IsDateString()
  publishAt?: string;

  @IsOptional()
  @IsIn(Object.values(POST_STATUS) as string[])
  status?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  socialAccountIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaIds?: string[];
}

export class UpdatePostDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @IsString()
  cta?: string;

  @IsOptional()
  @IsDateString()
  publishAt?: string;

  @IsOptional()
  @IsIn(Object.values(POST_STATUS) as string[])
  status?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  socialAccountIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaIds?: string[];
}
