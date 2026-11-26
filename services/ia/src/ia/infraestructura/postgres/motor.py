from sqlalchemy import Engine, create_engine


def crear_motor(url: str) -> Engine:
    return create_engine(url, pool_pre_ping=True, connect_args={"options": "-c search_path=ia,public"})
