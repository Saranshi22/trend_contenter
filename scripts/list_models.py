import os
import google.genai as genai

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

try:
    models = client.models.list()
    for model in models:
        print(model.name)
except Exception as e:
    print(f"Error: {e}")
