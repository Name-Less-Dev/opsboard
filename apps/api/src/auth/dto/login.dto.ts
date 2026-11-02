import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

// O `!` diz ao TS que o ValidationPipe/class-transformer preenche estes campos, não um construtor.
export class LoginDto {
  @ApiProperty({ example: 'supervisor@opsboard.dev' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'opsboard123', maxLength: 72 })
  @IsString()
  @IsNotEmpty()
  // O bcrypt só considera os primeiros 72 bytes; acima disso a senha seria truncada em silêncio.
  @MaxLength(72)
  password!: string;
}
