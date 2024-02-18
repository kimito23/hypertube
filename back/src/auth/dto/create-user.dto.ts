import {
  IsNotEmpty,
  IsEmail,
  Length,
  MaxLength,
  IsOptional,
} from 'class-validator';

export class CreateUserDto {
  @IsNotEmpty()
  @Length(2, 20)
  firstName: string;

  @IsNotEmpty()
  @Length(2, 20)
  lastName: string;

  @IsNotEmpty()
  @Length(2, 20)
  username: string;

  @IsNotEmpty()
  @IsEmail()
  @MaxLength(40)
  email: string;

  @IsNotEmpty()
  @Length(8, 20)
  password: string;

  @IsOptional()
  image: string;

  @IsOptional()
  provider: string;

  @IsOptional()
  emailVerified: boolean;
}
