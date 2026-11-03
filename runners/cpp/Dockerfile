FROM debian:bookworm-slim
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends g++ gdb python3-minimal libstdc++6 >/dev/null && rm -rf /var/lib/apt/lists/*
RUN useradd -u 10001 -M runner
COPY entry.py gdb_tracer.py support.h /opt/vizdsa/
RUN mkdir -p /opt/pch/bits && cp "$(find /usr/include -name 'stdc++.h' | head -1)" /opt/pch/bits/ && g++ -std=c++17 -g -O0 -x c++-header "$(find /usr/include -name 'stdc++.h' | head -1)" -o /opt/pch/bits/stdc++.h.gch && chmod -R a+rX /opt
USER runner
ENTRYPOINT ["python3", "/opt/vizdsa/entry.py"]
