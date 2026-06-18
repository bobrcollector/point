import asyncio
import sys

from app.seed.bootstrap import main, parse_seed_options

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main(parse_seed_options(sys.argv[1:])))
