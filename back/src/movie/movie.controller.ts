import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Headers,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { MoviesQueryDto } from './dto/movies-query.dto';
import { MovieService } from './movie.service';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { MovieQueryDto } from './dto/movie-query.dto';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/user/user.service';
import { TorrentService } from './torrent.service';
import pump from 'pump';
import { SubtitleService } from './subtitle.service';

@ApiTags('Movies')
@Controller('movies')
export class MovieController {
  constructor(
    private readonly movieService: MovieService,
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly torrentService: TorrentService,
    private readonly subtitleService: SubtitleService,
  ) {}

  @Get('/')
  async getMovies(
    @Query()
    query: MoviesQueryDto,
    @Req() req,
  ) {
    let userId = undefined;
    try {
      const payload = this.jwtService.verify(req.cookies['accessToken'], {
        secret: process.env.JWT_SECRET,
      });
      userId = payload.userId;
    } catch (e) {
      userId = undefined;
    }

    try {
      return await this.movieService.getMovies(query, userId);
    } catch (error) {
      Logger.error(error);
      throw new InternalServerErrorException();
    }
  }

  @UseInterceptors(CacheInterceptor)
  @Get('/:movie_id')
  @UseGuards(JwtAuthGuard)
  async getMovie(
    @Param('movie_id') movie_id,
    @Query() query: MovieQueryDto,
  ): Promise<any> {
    try {
      const data = await this.movieService.getMovie(movie_id, query);
      const imdb_id = data.imdb_id;
      const torrents = await this.movieService.getMovieTorrent(imdb_id);

      return { ...data, torrents };
    } catch (error) {
      Logger.error(error);
      throw new InternalServerErrorException();
    }
  }

  @Post('/:movie_id/subtitles')
  @UseGuards(JwtAuthGuard)
  async getSubtitles(@Param('movie_id') movie_id: number) {
    const subtitles = await this.subtitleService.search(movie_id);

    for (const subtitle of subtitles) {
      await this.subtitleService.download(movie_id, subtitle);
    }
  }

  @Get('/:movie_id/stream/:torrent_hash')
  @Header('Range', 'bytes')
  async streamMovie(
    @Param('movie_id') movie_id: number,
    @Param('torrent_hash') torrent_hash: string,
    @Headers() headers,
    @Req() req,
    @Res() res,
  ) {
    // Check access token
    const curAccessToken = req.cookies['accessToken'];
    const curRefreshToken = req.cookies['refreshToken'];
    let user_id = '';

    if (!curAccessToken) {
      if (!curRefreshToken) throw new UnauthorizedException();
      const payload = this.jwtService.verify(curRefreshToken, {
        secret: process.env.JWT_SECRET,
      });
      user_id = payload.userId;

      const { accessToken, ...accessOption } =
        this.authService.getCookieWithJwtAccessToken(payload.userId);
      const { refreshToken, ...refreshOption } =
        this.authService.getCookieWithJwtRefreshToken(payload.userId);

      res.cookie('accessToken', accessToken, accessOption);
      res.cookie('refreshToken', refreshToken, refreshOption);
      await this.userService.saveRefreshToken(payload.userId, refreshToken);
    } else {
      const payload = this.jwtService.verify(curAccessToken, {
        secret: process.env.JWT_SECRET,
      });
      user_id = payload.userId;
    }
    if (!headers.range) throw new BadRequestException("Missing 'Range' Header");

    const ranges: [string, string] = headers.range
      .replace(/bytes=/, '')
      .split('-');
    Logger.log(`Range: [${ranges[0]}, ${ranges[1]}]`);

    const { engine, movieFile } = await this.torrentService.init(
      torrent_hash,
      movie_id,
    );
    const chunkSize = Math.max(
      Math.floor(Number(movieFile.length) / 15),
      10 ** 6,
    );
    const start = Number(ranges[0]);
    const end = Math.min(start + chunkSize, movieFile.length - 1);
    const { stream, mpeg } = this.torrentService.createStream(start, end);

    req.on('close', async () => {
      stream.destroy();
      engine.destroy();
      Logger.log(`${movieFile.name} connection is destroyed`);
      await this.movieService.updateWatchedAt(movie_id, user_id);
    });

    res.set({
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${start}-${end}/${movieFile.length}`,
      'Content-Length': end - start + 1,
    });
    res.status(HttpStatus.PARTIAL_CONTENT);

    if (mpeg) {
      mpeg.pipe(res);
    } else {
      pump(stream, res);
    }
  }
}
