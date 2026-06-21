from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root_url():
    return {"message": "you've come to the root page"}