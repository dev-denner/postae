import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}
