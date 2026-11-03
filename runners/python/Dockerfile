FROM python:3.12-slim
RUN useradd -u 10001 -M runner
COPY tracer.py leetcode_types.py /opt/vizdsa/
USER runner
ENTRYPOINT ["python3", "-I", "/opt/vizdsa/tracer.py"]
