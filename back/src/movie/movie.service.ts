import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { IComment } from 'src/comment/IComment';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { MoviesQueryDto } from './dto/movies-query.dto';
import { MovieQueryDto } from './dto/movie-query.dto';
import { Movie } from './movie.entity';
import { MoviesWatched } from './movies-watched.entity';

@Injectable()
export class MovieService {
  private tmdb: AxiosInstance;
  private yts: AxiosInstance;
  private readonly Genre = {
    '12': {
      'en-US': 'Adventure',
      'fr-FR': 'Aventure',
    },
    '14': {
      'en-US': 'Fantasy',
      'fr-FR': 'Fantastique',
    },
    '16': {
      'en-US': 'Animation',
      'fr-FR': 'Animation',
    },
    '18': {
      'en-US': 'Drama',
      'fr-FR': 'Drame',
    },
    '27': { 'en-US': 'Horror', 'fr-FR': 'Horreur' },
    '28': {
      'en-US': 'Action',
      'fr-FR': 'Action',
    },
    '35': {
      'en-US': 'Comedy',
      'fr-FR': 'Comédie',
    },
    '36': {
      'en-US': 'History',
      'fr-FR': 'Histoire',
    },
    '37': {
      'en-US': 'Western',
      'fr-FR': 'Western',
    },
    '53': {
      'en-US': 'Thriller',
      'fr-FR': 'Thriller',
    },
    '80': {
      'en-US': 'Crime',
      'fr-FR': 'Crime',
    },
    '99': {
      'en-US': 'Documentary',
      'fr-FR': 'Documentaire',
    },
    '878': {
      'en-US': 'Science Fiction',
      'fr-FR': 'Science-fiction',
    },
    '9648': {
      'en-US': 'Mystery',
      'fr-FR': 'Mystère',
    },
    '10402': {
      'en-US': 'Music',
      'fr-FR': 'Musique',
    },
    '10749': {
      'en-US': 'Romance',
      'fr-FR': 'Romance',
    },
    '10751': {
      'en-US': 'Family',
      'fr-FR': 'Familial',
    },
    '10752': {
      'en-US': 'War',
      'fr-FR': 'Guerre',
    },
    '10770': {
      'en-US': 'TV Movie',
      'fr-FR': 'Téléfilm',
    },
  };
  constructor(
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,
    @InjectRepository(MoviesWatched)
    private readonly moviesWatchedRepository: Repository<MoviesWatched>,
    private readonly connection: DataSource,
  ) {
    this.tmdb = axios.create({
      baseURL: 'https://api.themoviedb.org/3',
      headers: {
        Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`,
      },
    });

    this.yts = axios.create({
      baseURL: 'https://yts.mx/api/v2/',
    });
  }

  async getMovies(query: MoviesQueryDto, userId?: string) {
    query.page = query.page || 1;
    query.language = query.language || 'en-US';

    const mode = query.search?.length > 0 ? 'search' : 'discover';

    const { data } = await this.tmdb.get(`/${mode}/movie`, {
      params: {
        include_adult: false,
        query: query.search,
        ...query,
      },
    });
    const results = await Promise.all([
      ...data.results.map(async (movie) => ({
        ...movie,
        genres: movie.genre_ids?.map((id) => ({
          id: id,
          name: this.Genre[id][query.language],
        })),
        vote_average: Number(movie.vote_average).toFixed(1),
        is_watched: userId
          ? !!(await this.checkUserWatched(movie.id, userId))
          : false,
      })),
    ]);
    return {
      ...data,
      results,
    };
  }

  async getMovie(movie_id, query: MovieQueryDto) {
    query.language = query.language || 'en-US';

    const { data } = await this.tmdb.get(`/movie/${movie_id}`, {
      params: {
        ...query,
      },
    });
    data.vote_average = Number(data.vote_average).toFixed(1);
    return data;
  }

  async getMovieData(movieId: number): Promise<Movie> {
    return this.movieRepository
      .createQueryBuilder('movie')
      .leftJoinAndSelect('movie.Comments', 'comment')
      .leftJoin('comment.User', 'user')
      .addSelect(['user.id', 'user.username', 'user.image'])
      .where('movie.id = :movieId', { movieId })
      .getOne();
  }

  async createMovieData(movieId: number) {
    Logger.log('start creating move');
    const createMovieDto = { id: movieId };
    const movie = this.movieRepository.create(createMovieDto);
    await this.movieRepository.save(movie);
    Logger.log('move has been created');
  }

  async addCommentToMovieData(movieId: number, comment: IComment) {
    const movie = await this.getMovieData(movieId);
    if (!movie) {
      throw new Error('Movie not found');
    }
    movie.Comments.push(comment);
    return await this.movieRepository.save(movie);
  }

  async updateCommentFromMovieData(movieId: number, updatedComment: IComment) {
    const movie = await this.getMovieData(movieId);
    if (!movie) {
      throw new Error('Movie not found');
    }
    const updatedMovie = {
      ...movie,
      comments: movie.Comments.map((movieComment) =>
        movieComment.id === updatedComment.id ? updatedComment : movieComment,
      ),
    };

    return await this.movieRepository.save(updatedMovie);
  }

  async removeCommentFromMovieData(movieId: number, commentId: number) {
    const movie = await this.getMovieData(movieId);
    if (!movie) {
      throw new Error('Movie not found');
    }
    const commentIndex = movie.Comments.findIndex(
      (comment) => comment.id === commentId,
    );
    if (commentIndex === -1) {
      throw new Error('Comment not found in movie');
    }
    movie.Comments.splice(commentIndex, 1);
    return await this.movieRepository.save(movie);
  }

  async getMovieTorrent(imdb_id: string) {
    const { data: response } = await this.yts.get(`movie_details.json`, {
      params: {
        imdb_id,
      },
    });
    return response.data.movie?.torrents || [];
  }

  async checkUserWatched(movieId: number, userId: string) {
    return await this.moviesWatchedRepository.findOneBy({ movieId, userId });
  }

  async updateWatchedAt(movieId: number, userId: string) {
    Logger.log(`Update watched at: ${movieId} ${userId}`);
    const queryRunner = this.connection.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      await queryRunner.manager.getRepository(Movie).upsert(
        { id: movieId, watchedAt: new Date() },
        {
          conflictPaths: ['id'],
          upsertType: 'on-conflict-do-update',
        },
      );
      await queryRunner.manager.getRepository(MoviesWatched).upsert(
        {
          movieId,
          userId,
          watchedAt: new Date(),
        },
        {
          conflictPaths: ['movieId', 'userId'],
          upsertType: 'on-conflict-do-update',
        },
      );
      await queryRunner.commitTransaction();
    } catch (error) {
      console.error(error);
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException();
    } finally {
      await queryRunner.release();
    }
  }
}
