import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from './user/user.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { CommentModule } from './comment/comment.module';
import { MovieModule } from './movie/movie.module';
import { join } from 'path';
import { AppController } from './app.controller';
import { User } from './user/user.entity';
import { Movie } from './movie/movie.entity';
import { Comment } from './comment/comment.entity';
import { MoviesWatched } from './movie/movies-watched.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: '../.env' }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'db-mysql',
      port: 3306,
      username: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      entities: [join(__dirname, '**', '*.entity.{ts,js}')],
      // synchronize: true,
      // migrationsRun: true,
    }),
    UserModule,
    AuthModule,
    CommentModule,
    MovieModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
